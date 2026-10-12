import { TranslationError, type TranslationProvider } from "../types";
import {
  abortable,
  assertNotAborted,
  invalidResponse,
  isRecord,
  normalizeLanguage,
  validateSegments,
} from "./shared";

interface NativeTranslator {
  translate(text: string, options: { signal: AbortSignal }): Promise<string>;
  destroy(): void;
}
interface NativeDetector {
  detect(text: string, options: { signal: AbortSignal }): Promise<unknown>;
  destroy(): void;
}
type NativeFactory<T> = ((...args: never[]) => unknown) & {
  create(options: Record<string, unknown>): Promise<T>;
  availability?(): Promise<string>;
};
type NativeGlobal = typeof globalThis & {
  Translator?: NativeFactory<NativeTranslator>;
  LanguageDetector?: NativeFactory<NativeDetector>;
};

const localGuidance =
  "请使用支持本地翻译 API 的桌面浏览器并在 HTTPS 页面重试，或在设置中选择本机 Ollama。";
// Deliberately use only the userscript's global realm: never unsafeWindow or a page bridge.
function nativeFactory<T>(
  name: "Translator" | "LanguageDetector",
): NativeFactory<T> | null {
  const value = (globalThis as NativeGlobal)[name];
  if (
    !globalThis.isSecureContext ||
    typeof value !== "function" ||
    typeof value.create !== "function" ||
    !Function.prototype.toString.call(value).includes("[native code]") ||
    !Function.prototype.toString.call(value.create).includes("[native code]")
  )
    return null;
  return value as NativeFactory<T>;
}

function requireActivation(): void {
  if (!globalThis.navigator?.userActivation?.isActive) {
    throw new TranslationError(
      "首次加载本地语言包需要点击“翻译页面”。请选择明确的原文语言后再次点击。",
      "activation",
    );
  }
}

function nativeError(error: unknown): Error {
  if (error instanceof TranslationError) return error;
  // DOMExceptions can come from a browser realm whose Error constructor differs.
  const name =
    isRecord(error) && typeof error.name === "string" ? error.name : "";
  if (name === "AbortError") return new DOMException("Cancelled", "AbortError");
  const message =
    name === "NotAllowedError"
      ? "浏览器未允许本地翻译，请点击翻译按钮并检查网页权限。"
      : name === "NotSupportedError"
        ? "浏览器本地翻译不支持所选语言方向。"
        : name === "QuotaExceededError"
          ? "本地翻译文本超过模型限制，请减小每批字符数。"
          : "浏览器本地翻译无法启动或模型尚未就绪。";
  return new TranslationError(`${message}${localGuidance}`, "browser");
}

function browserLanguage(value: string): string {
  const language = normalizeLanguage(value);
  return language === "zh-Hans" ? "zh" : language;
}

export function createBrowserProvider(): TranslationProvider {
  const translators = new Map<string, Promise<NativeTranslator>>();
  let detectorPromise: Promise<NativeDetector> | undefined;
  const capabilities = { maxChars: 5000, concurrency: 1, requiresSource: true };
  return {
    id: "browser",
    capabilities,
    async translate(segments, context) {
      assertNotAborted(context.signal);
      validateSegments(segments, capabilities.maxChars);
      if (!segments.length) return [];
      const factory = nativeFactory<NativeTranslator>("Translator");
      if (!factory) {
        throw new TranslationError(
          `当前油猴环境没有可安全调用的浏览器原生翻译 API。${localGuidance}`,
          "unavailable",
        );
      }
      const sourceLanguage = browserLanguage(context.source);
      const targetLanguage = browserLanguage(context.target);
      if (sourceLanguage === targetLanguage) {
        throw new TranslationError(
          "原文语言与目标语言相同，请调整语言方向。",
          "language",
        );
      }
      const key = `${sourceLanguage}:${targetLanguage}`;
      try {
        let pending = translators.get(key);
        if (!pending) {
          requireActivation();
          // Call create before the first await to preserve the caller's user activation.
          pending = factory.create({
            sourceLanguage,
            targetLanguage,
            signal: context.signal,
          });
          translators.set(key, pending);
          const created = pending;
          const remove = () => {
            if (translators.get(key) === created) translators.delete(key);
          };
          context.signal.addEventListener(
            "abort",
            () => {
              remove();
              void created.then(
                (instance) => instance.destroy(),
                () => {},
              );
            },
            { once: true },
          );
          void created.catch(remove);
        }
        const instance = await abortable(pending, context.signal);
        const results = [];
        for (const segment of segments) {
          assertNotAborted(context.signal);
          const text = await abortable(
            instance.translate(segment.text, { signal: context.signal }),
            context.signal,
          );
          if (typeof text !== "string" || !text.trim()) throw invalidResponse();
          results.push({ id: segment.id, text: text.trim() });
        }
        return results;
      } catch (error) {
        throw nativeError(error);
      }
    },
    async healthCheck(signal) {
      assertNotAborted(signal);
      if (!nativeFactory<NativeTranslator>("Translator")) {
        throw new TranslationError(
          `当前油猴环境没有可安全调用的浏览器原生翻译 API。${localGuidance}`,
          "unavailable",
        );
      }
      return "检测到浏览器原生翻译 API；首次翻译需要点击按钮下载对应语言包。";
    },
    async detectLanguage(text, signal) {
      assertNotAborted(signal);
      if (!text.trim()) return null;
      const factory = nativeFactory<NativeDetector>("LanguageDetector");
      if (!factory) return null;
      try {
        if (!detectorPromise) {
          if (
            typeof factory.availability !== "function" ||
            !Function.prototype.toString
              .call(factory.availability)
              .includes("[native code]") ||
            (await abortable(factory.availability(), signal)) !== "available"
          )
            return null;
          requireActivation();
          detectorPromise = factory.create({ signal });
          const created = detectorPromise;
          const remove = () => {
            if (detectorPromise === created) detectorPromise = undefined;
          };
          signal.addEventListener(
            "abort",
            () => {
              remove();
              void created.then(
                (instance) => instance.destroy(),
                () => {},
              );
            },
            { once: true },
          );
          void created.catch(remove);
        }
        const detector = await abortable(detectorPromise, signal);
        const candidates = await abortable(
          detector.detect(text, { signal }),
          signal,
        );
        if (!Array.isArray(candidates)) return null;
        const best: unknown = candidates[0];
        if (typeof best !== "object" || best === null) return null;
        const candidate = best as Record<string, unknown>;
        if (
          typeof candidate.detectedLanguage !== "string" ||
          candidate.detectedLanguage === "und" ||
          typeof candidate.confidence !== "number" ||
          candidate.confidence < 0.7
        )
          return null;
        return normalizeLanguage(candidate.detectedLanguage);
      } catch (error) {
        if (isRecord(error) && error.name === "AbortError")
          throw new DOMException("Cancelled", "AbortError");
        return null;
      }
    },
  };
}
