import { validateEndpoint } from "../platform/gm";
import {
  TranslationError,
  type Segment,
  type TranslationResult,
} from "../types";

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

export function unicodeLength(text: string): number {
  return Array.from(text).length;
}

export function validateSegments(segments: Segment[], maxChars: number): void {
  const ids = new Set<string>();
  let length = 0;
  for (const segment of segments) {
    if (
      !segment ||
      typeof segment.id !== "string" ||
      !segment.id.trim() ||
      typeof segment.text !== "string" ||
      !segment.text.trim() ||
      ids.has(segment.id)
    ) {
      throw new TranslationError("待翻译段落为空，或段落标识重复。", "input");
    }
    ids.add(segment.id);
    length += unicodeLength(segment.text);
  }
  if (length > maxChars) {
    throw new TranslationError(
      `本次文本超过 ${maxChars} 字符，请拆分后重试。`,
      "input",
    );
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function invalidResponse(): TranslationError {
  return new TranslationError(
    "翻译服务返回内容为空或格式不正确，请重试或切换引擎。",
    "response",
  );
}

export function parseTranslations(
  content: unknown,
  segments: Segment[],
): TranslationResult[] {
  if (typeof content !== "string" || !content.trim()) throw invalidResponse();
  const clean = content
    .trim()
    .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
  let value: unknown;
  try {
    value = JSON.parse(clean) as unknown;
  } catch {
    throw invalidResponse();
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.translations) ||
    value.translations.length !== segments.length
  )
    throw invalidResponse();
  const expected = new Set(segments.map((segment) => segment.id));
  const results = new Map<string, string>();
  for (const item of value.translations) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !expected.has(item.id) ||
      results.has(item.id) ||
      typeof item.text !== "string" ||
      !item.text.trim()
    ) {
      throw invalidResponse();
    }
    results.set(item.id, item.text.trim());
  }
  return segments.map((segment) => ({
    id: segment.id,
    text: results.get(segment.id)!,
  }));
}

export function apiUrl(endpoint: string, suffix: string): string {
  const url = validateEndpoint(endpoint.trim());
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith(suffix)) {
    url.pathname = `${path}${
      path.endsWith("/api") && suffix.startsWith("/api/")
        ? suffix.slice(4)
        : suffix
    }`;
  }
  return url.toString();
}

export function normalizeLanguage(language: string, allowAuto = false): string {
  const value = language.trim();
  if (value.toLowerCase() === "auto") {
    if (allowAuto) return "auto";
    throw new TranslationError(
      "请先选择原文语言，浏览器翻译需要明确的语言方向。",
      "language",
    );
  }
  const aliases: Record<string, string> = {
    "zh-chs": "zh-Hans",
    "zh-cht": "zh-Hant",
    "zh-cn": "zh-Hans",
    "zh-sg": "zh-Hans",
    "zh-tw": "zh-Hant",
    "zh-hk": "zh-Hant",
  };
  try {
    return Intl.getCanonicalLocales(aliases[value.toLowerCase()] ?? value)[0]!;
  } catch {
    throw new TranslationError("语言代码无效，请重新选择语言。", "language");
  }
}

export function modelName(model: string): string {
  if (!model.trim())
    throw new TranslationError("请在设置中填写模型名称。", "config");
  return model.trim();
}

export function requiredCredential(
  value: string | undefined,
  message: string,
): string {
  if (!value?.trim()) throw new TranslationError(message, "credentials");
  return value.trim();
}

export function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  assertNotAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}
