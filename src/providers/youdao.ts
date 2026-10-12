import { requestJson } from "../platform/gm";
import {
  TranslationError,
  type Credentials,
  type ProviderConfig,
  type TranslationProvider,
} from "../types";
import {
  apiUrl,
  assertNotAborted,
  invalidResponse,
  isRecord,
  normalizeLanguage,
  requiredCredential,
  validateSegments,
} from "./shared";

export function youdaoInput(text: string): string {
  const chars = Array.from(text);
  return chars.length <= 20
    ? text
    : chars.slice(0, 10).join("") + chars.length + chars.slice(-10).join("");
}

function languageCode(language: string, allowAuto = false): string {
  const value = normalizeLanguage(language, allowAuto);
  if (value === "auto") return value;
  if (value === "zh" || value.startsWith("zh-Hans")) return "zh-CHS";
  if (value.startsWith("zh-Hant")) return "zh-CHT";
  return value.split("-")[0]!;
}

const errors: Record<string, [string, boolean]> = {
  "102": ["有道不支持所选语言方向。", false],
  "103": ["有道翻译文本过长，请减少每批字符数。", false],
  "108": ["有道应用 ID 无效，请检查设置。", false],
  "110": ["有道应用未绑定文本翻译服务，请在有道控制台开通并绑定。", false],
  "202": ["有道签名校验失败，请检查应用 ID 与应用密钥。", false],
  "203": ["有道限制了访问 IP，请检查应用访问设置。", false],
  "206": ["设备时间与服务器不一致，请校准系统时间。", false],
  "207": ["有道拒绝了重复请求，请重新翻译。", true],
  "301": ["有道服务查询失败，请稍后重试。", true],
  "302": ["有道翻译查询失败，请稍后重试。", true],
  "303": ["有道服务暂时异常，请稍后重试。", true],
  "304": ["有道翻译失败，请稍后重试。", true],
  "401": ["有道账户余额不足，请充值或切换本地引擎。", false],
  "411": ["有道请求频率受限，请稍后重试。", true],
  "412": ["有道长文本请求过于频繁，请稍后重试。", true],
};

export function createYoudaoProvider(
  config: ProviderConfig,
  credentials: Credentials,
): TranslationProvider {
  const capabilities = {
    maxChars: 5000,
    concurrency: 2,
    requiresSource: false,
  };
  const getCredentials = () => ({
    appKey: requiredCredential(
      credentials.appKey,
      "请在油猴菜单设置密钥，填写有道应用 ID。",
    ),
    appSecret: requiredCredential(
      credentials.appSecret,
      "请在油猴菜单设置密钥，填写有道应用密钥。",
    ),
  });
  return {
    id: "youdao",
    capabilities,
    async translate(segments, context) {
      assertNotAborted(context.signal);
      validateSegments(segments, capabilities.maxChars);
      if (!segments.length) return [];
      const { appKey, appSecret } = getCredentials();
      const from = languageCode(context.source, true);
      const to = languageCode(context.target);
      if (!globalThis.crypto?.subtle || !globalThis.crypto.randomUUID) {
        throw new TranslationError(
          "此页面无法使用安全签名，请在 HTTPS 页面使用有道，或切换本地引擎。",
          "environment",
        );
      }
      const results = [];
      for (const segment of segments) {
        assertNotAborted(context.signal);
        const salt = crypto.randomUUID();
        const curtime = String(Math.floor(Date.now() / 1000));
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            appKey + youdaoInput(segment.text) + salt + curtime + appSecret,
          ),
        );
        assertNotAborted(context.signal);
        const sign = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        const form = new URLSearchParams({
          q: segment.text,
          from,
          to,
          appKey,
          salt,
          curtime,
          sign,
          signType: "v3",
          strict: "true",
        });
        const response = await requestJson<unknown>({
          url: apiUrl(config.endpoint, "/api"),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: form.toString(),
          signal: context.signal,
        });
        assertNotAborted(context.signal);
        if (!isRecord(response) || typeof response.errorCode !== "string")
          throw invalidResponse();
        if (response.errorCode !== "0") {
          const [message, retryable] = errors[response.errorCode] ?? [
            "有道翻译请求失败，请检查应用配置或稍后重试。",
            false,
          ];
          throw new TranslationError(
            message,
            `youdao:${response.errorCode}`,
            retryable,
          );
        }
        if (
          !Array.isArray(response.translation) ||
          !response.translation.length ||
          response.translation.some(
            (text: unknown) => typeof text !== "string" || !text.trim(),
          )
        ) {
          throw invalidResponse();
        }
        results.push({
          id: segment.id,
          text: response.translation.join("\n").trim(),
        });
      }
      return results;
    },
    async healthCheck(signal) {
      assertNotAborted(signal);
      getCredentials();
      apiUrl(config.endpoint, "/api");
      return "有道配置格式已检查；实际可用性需翻译验证，调用可能产生 API 费用。";
    },
  };
}
