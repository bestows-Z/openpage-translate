import { TranslationError } from "../types";

interface GMResponse {
  status: number;
  responseText: string;
}
interface GMRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout: number;
  anonymous: boolean;
  onload(response: GMResponse): void;
  onerror(): void;
  ontimeout(): void;
  onabort(): void;
}
declare const GM_xmlhttpRequest:
  ((options: GMRequest) => { abort(): void }) | undefined;
declare const GM_getValue: (<T>(key: string, fallback: T) => T) | undefined;
declare const GM_setValue: ((key: string, value: unknown) => void) | undefined;
declare const GM_registerMenuCommand:
  ((label: string, handler: () => void) => void) | undefined;
declare const GM_setClipboard:
  ((text: string, type?: string) => void) | undefined;

export function getStored<T>(key: string, fallback: T): T {
  return typeof GM_getValue === "function"
    ? GM_getValue(key, fallback)
    : fallback;
}
export function setStored(key: string, value: unknown): void {
  if (typeof GM_setValue === "function") GM_setValue(key, value);
}
export function registerMenu(label: string, handler: () => void): void {
  if (typeof GM_registerMenuCommand === "function")
    GM_registerMenuCommand(label, handler);
}
export async function copyText(text: string): Promise<void> {
  if (typeof GM_setClipboard === "function") GM_setClipboard(text, "text");
  else await navigator.clipboard.writeText(text);
}
export interface RequestOptions {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  signal?: AbortSignal;
  timeout?: number;
}
export async function requestJson<T>(options: RequestOptions): Promise<T> {
  validateEndpoint(options.url);
  if (options.signal?.aborted)
    throw new DOMException("Cancelled", "AbortError");
  if (typeof GM_xmlhttpRequest !== "function") {
    throw new TranslationError("请在 Tampermonkey 中运行脚本。", "environment");
  }
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    let handle: { abort(): void } | undefined;
    const finish = (action: () => void) => {
      if (finished) return;
      finished = true;
      options.signal?.removeEventListener("abort", abort);
      action();
    };
    const abort = () => {
      finish(() => reject(new DOMException("Cancelled", "AbortError")));
      handle?.abort();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      handle = GM_xmlhttpRequest!({
        method: options.method ?? "POST",
        url: options.url,
        headers: options.headers,
        data: options.data,
        timeout: options.timeout ?? 45000,
        anonymous: true,
        onload: (response) =>
          finish(() => {
            if (response.status < 200 || response.status >= 300) {
              const status = response.status;
              const message =
                status === 401 || status === 403
                  ? "密钥无效或没有访问权限。"
                  : status === 402
                    ? "账户余额不足。"
                    : status === 429
                      ? "请求过于频繁，请稍后重试。"
                      : `翻译服务返回 HTTP ${status}。`;
              reject(
                new TranslationError(
                  message,
                  String(status),
                  status === 429 || status >= 500,
                ),
              );
              return;
            }
            try {
              resolve(JSON.parse(response.responseText) as T);
            } catch {
              reject(
                new TranslationError("翻译服务返回了无效 JSON。", "response"),
              );
            }
          }),
        onerror: () =>
          finish(() =>
            reject(
              new TranslationError(
                "连接失败，请检查服务地址、网络及油猴域名授权。",
                "network",
                true,
              ),
            ),
          ),
        ontimeout: () =>
          finish(() =>
            reject(new TranslationError("翻译请求超时。", "timeout", true)),
          ),
        onabort: () =>
          finish(() => reject(new DOMException("Cancelled", "AbortError"))),
      });
      if (options.signal?.aborted) abort();
    } catch {
      finish(() =>
        reject(
          new TranslationError(
            "请求未获授权，请检查油猴连接权限。",
            "permission",
          ),
        ),
      );
    }
  });
}

export function validateEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TranslationError("服务地址格式不正确。", "config");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TranslationError(
      "服务地址不能包含密码、查询参数或片段。",
      "config",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new TranslationError(
      "远程服务必须使用 HTTPS；本机回环地址可使用 HTTP。",
      "config",
    );
  }
  return url;
}
