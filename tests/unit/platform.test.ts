import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson, validateEndpoint } from "../../src/platform/gm";

afterEach(() => vi.unstubAllGlobals());
describe("GM network boundary", () => {
  it("returns JSON and never includes service response contents in errors", async () => {
    vi.stubGlobal(
      "GM_xmlhttpRequest",
      (options: { onload(response: unknown): void }) => {
        options.onload({
          status: 401,
          responseText: "sensitive-service-output",
        });
        return { abort() {} };
      },
    );
    await expect(
      requestJson({ url: "https://example.com", data: "private-input" }),
    ).rejects.toMatchObject({
      code: "401",
      message: "密钥无效或没有访问权限。",
    });
  });
  it("aborts a request and ignores a later successful callback", async () => {
    let complete!: (value: unknown) => void;
    const abort = vi.fn();
    vi.stubGlobal(
      "GM_xmlhttpRequest",
      (options: { onload(response: unknown): void }) => {
        complete = options.onload;
        return { abort };
      },
    );
    const signal = new AbortController();
    const result = requestJson({
      url: "https://example.com",
      signal: signal.signal,
    });
    signal.abort();
    complete({ status: 200, responseText: '{"ok":true}' });
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(abort).toHaveBeenCalledOnce();
  });
  it("rejects invalid JSON and marks rate limiting retryable", async () => {
    vi.stubGlobal(
      "GM_xmlhttpRequest",
      (options: { onload(response: unknown): void }) => {
        options.onload({ status: 429, responseText: "" });
        return { abort() {} };
      },
    );
    await expect(
      requestJson({ url: "https://example.com" }),
    ).rejects.toMatchObject({ code: "429", retryable: true });
    vi.stubGlobal(
      "GM_xmlhttpRequest",
      (options: { onload(response: unknown): void }) => {
        options.onload({ status: 200, responseText: "no" });
        return { abort() {} };
      },
    );
    await expect(
      requestJson({ url: "https://example.com" }),
    ).rejects.toMatchObject({ code: "response" });
  });
  it("requires HTTPS remotely and forbids embedded secrets", () => {
    expect(() => validateEndpoint("http://example.com")).toThrow();
    expect(() => validateEndpoint("https://key:secret@example.com")).toThrow();
    expect(() => validateEndpoint("https://example.com?key=secret")).toThrow();
    expect(validateEndpoint("http://127.0.0.1:11434").hostname).toBe(
      "127.0.0.1",
    );
  });
});
