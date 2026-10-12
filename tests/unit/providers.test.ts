import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/platform/gm";
import { createProvider } from "../../src/providers";
import { youdaoInput } from "../../src/providers/youdao";
import type { ProviderConfig, TranslationContext } from "../../src/types";

vi.mock("../../src/platform/gm", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/platform/gm")>();
  return { ...original, requestJson: vi.fn() };
});

const request = vi.mocked(requestJson);
const segments = [
  { id: "first", text: "Hello world." },
  { id: "second", text: "Good morning." },
];
const config: ProviderConfig = {
  endpoint: "https://api.deepseek.com",
  model: "deepseek-flash",
};
function context(signal = new AbortController().signal): TranslationContext {
  return { source: "en", target: "zh-Hans", signal };
}
function completion(translations: unknown, finish_reason = "stop") {
  return {
    choices: [
      { finish_reason, message: { content: JSON.stringify({ translations }) } },
    ],
  };
}
function fakeNativeFactory(
  create: (...args: unknown[]) => unknown,
  availability: (...args: unknown[]) => unknown = () =>
    Promise.resolve("available"),
) {
  // Bound fixture functions have V8 native wrappers; no real browser API or downloads are used.
  return Object.assign(function () {}.bind(null), {
    create: create.bind(null),
    availability: availability.bind(null),
  });
}

beforeEach(() => {
  request.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LLM translation adapters", () => {
  it("preserves paragraph identity when a cloud model returns reordered results", async () => {
    request.mockResolvedValue(
      completion([
        { id: "second", text: "早上好。" },
        { id: "first", text: "你好，世界。" },
      ]),
    );
    const provider = createProvider("deepseek", config, {
      apiKey: "user-test-key",
    });
    expect(await provider.translate(segments, context())).toEqual([
      { id: "first", text: "你好，世界。" },
      { id: "second", text: "早上好。" },
    ]);
    const options = request.mock.calls[0]![0];
    expect(options.url).toBe("https://api.deepseek.com/chat/completions");
    expect(options.headers?.Authorization).toBe("Bearer user-test-key");
    const payload = JSON.parse(options.data!) as Record<string, unknown>;
    expect(payload).toMatchObject({
      model: "deepseek-flash",
      stream: false,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
    });
    expect(options.data).not.toContain("user-test-key");
  });

  it.each([
    [
      "duplicate",
      [
        { id: "first", text: "一" },
        { id: "first", text: "二" },
      ],
    ],
    [
      "extra",
      [
        { id: "first", text: "一" },
        { id: "unknown", text: "二" },
      ],
    ],
    ["missing", [{ id: "first", text: "一" }]],
    [
      "empty text",
      [
        { id: "first", text: " " },
        { id: "second", text: "二" },
      ],
    ],
    [
      "wrong ID type",
      [
        { id: 1, text: "一" },
        { id: "second", text: "二" },
      ],
    ],
    ["null", null],
  ])(
    "rejects %s results instead of associating them with the wrong DOM paragraph",
    async (_label, result) => {
      request.mockResolvedValue(completion(result));
      await expect(
        createProvider("deepseek", config, { apiKey: "key" }).translate(
          segments,
          context(),
        ),
      ).rejects.toMatchObject({ code: "response", retryable: false });
    },
  );

  it.each([
    null,
    {},
    { choices: [] },
    { choices: [{ message: { content: "" } }] },
    { choices: [{ message: { content: "<p>not json</p>" } }] },
  ])("rejects malformed response envelopes", async (response) => {
    request.mockResolvedValue(response);
    await expect(
      createProvider(
        "openai",
        { ...config, endpoint: "https://proxy.example/v1" },
        { apiKey: "key" },
      ).translate(segments, context()),
    ).rejects.toMatchObject({ code: "response" });
  });

  it("rejects truncated output even if the parsed IDs happen to be complete", async () => {
    request.mockResolvedValue(
      completion(
        [
          { id: "first", text: "一" },
          { id: "second", text: "二" },
        ],
        "length",
      ),
    );
    await expect(
      createProvider("deepseek", config, { apiKey: "key" }).translate(
        segments,
        context(),
      ),
    ).rejects.toMatchObject({ code: "response" });
  });

  it("uses the configured OpenAI compatible path without duplicating chat/completions", async () => {
    request.mockResolvedValue(completion([{ id: "first", text: "一" }]));
    const provider = createProvider(
      "openai",
      {
        endpoint: "https://proxy.example/v1/chat/completions/",
        model: "custom",
      },
      { apiKey: "key" },
    );
    await provider.translate(segments.slice(0, 1), context());
    expect(request.mock.calls[0]![0].url).toBe(
      "https://proxy.example/v1/chat/completions/",
    );
  });

  it("rejects missing credentials, duplicate input IDs, oversize batches, and pre-cancelled requests locally", async () => {
    const provider = createProvider("deepseek", config, {});
    await expect(provider.translate(segments, context())).rejects.toMatchObject(
      { code: "credentials" },
    );
    await expect(
      provider.translate([segments[0]!, segments[0]!], context()),
    ).rejects.toMatchObject({ code: "input" });
    await expect(
      provider.translate([{ id: "large", text: "x".repeat(8001) }], context()),
    ).rejects.toMatchObject({ code: "input" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.translate(segments, context(controller.signal)),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });

  it("forwards the cancellation signal and never turns an abort into a provider error", async () => {
    request.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    const ctx = context();
    await expect(
      createProvider("deepseek", config, { apiKey: "key" }).translate(
        segments,
        ctx,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request.mock.calls[0]![0].signal).toBe(ctx.signal);
  });

  it("cloud configuration checks do not send a billable test translation", async () => {
    const provider = createProvider("deepseek", config, { apiKey: "key" });
    expect(await provider.healthCheck()).toContain("可能产生 API 费用");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("Ollama local adapter", () => {
  const local = { endpoint: "http://localhost:11434", model: "qwen3:4b" };
  it("uses nonstreaming JSON output with the local model and no API credentials", async () => {
    request
      .mockResolvedValueOnce({ models: [{ name: "qwen3:4b" }] })
      .mockResolvedValueOnce({
        done: true,
        message: {
          content: JSON.stringify({
            translations: [{ id: "first", text: "你好。" }],
          }),
        },
      });
    const provider = createProvider("ollama", local, {
      apiKey: "should-not-be-sent",
    });
    await expect(
      provider.translate(segments.slice(0, 1), context()),
    ).resolves.toEqual([{ id: "first", text: "你好。" }]);
    const options = request.mock.calls[1]![0];
    expect(options.url).toBe("http://localhost:11434/api/chat");
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(options.data!)).toMatchObject({
      model: "qwen3:4b",
      format: "json",
      stream: false,
      think: false,
    });
  });

  it("rejects unfinished local responses", async () => {
    request
      .mockResolvedValueOnce({ models: [{ name: "qwen3:4b" }] })
      .mockResolvedValueOnce({
        done: false,
        message: { content: '{"translations":[]}' },
      });
    await expect(
      createProvider("ollama", local, {}).translate(segments, context()),
    ).rejects.toMatchObject({ code: "response" });
  });

  it.each([
    { ...local, endpoint: "https://cloud.example" },
    { ...local, model: "large-model-cloud" },
  ])(
    "rejects remote endpoints and explicit cloud model selections",
    async (settings) => {
      await expect(
        createProvider("ollama", settings, {}).translate(segments, context()),
      ).rejects.toMatchObject({ code: "config" });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("checks model installation without generating translations", async () => {
    request.mockResolvedValue({ models: [{ name: "qwen3:4b" }] });
    expect(await createProvider("ollama", local, {}).healthCheck()).toContain(
      "模型已安装",
    );
    expect(request.mock.calls[0]![0]).toMatchObject({
      method: "GET",
      url: "http://localhost:11434/api/tags",
    });
  });

  it("explains missing local models and rejects cloud metadata", async () => {
    request.mockResolvedValueOnce({ models: [] }).mockResolvedValueOnce({
      models: [
        {
          name: "qwen3:4b",
          remote_host: "https://ollama.com",
          remote_model: "qwen3",
        },
      ],
    });
    const provider = createProvider("ollama", local, {});
    await expect(provider.healthCheck()).rejects.toMatchObject({
      code: "model",
    });
    await expect(provider.healthCheck()).rejects.toMatchObject({
      code: "model",
    });
  });

  it.each([
    { models: [] },
    { models: [{ name: "qwen3:4b", remote_model: "remote-alias" }] },
    { models: [{ name: "qwen3:4b", remote_host: "https://ollama.com" }] },
  ])(
    "validates local model metadata before direct translation, without a prior health check",
    async (metadata) => {
      request.mockResolvedValueOnce(metadata);
      await expect(
        createProvider("ollama", local, {}).translate(segments, context()),
      ).rejects.toMatchObject({ code: "model" });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]![0].url).toBe(
        "http://localhost:11434/api/tags",
      );
    },
  );

  it("caches successful local metadata validation for subsequent batches", async () => {
    request
      .mockResolvedValueOnce({ models: [{ name: "qwen3:4b" }] })
      .mockResolvedValue({
        done: true,
        message: {
          content: JSON.stringify({
            translations: [{ id: "first", text: "你好" }],
          }),
        },
      });
    const provider = createProvider("ollama", local, {});
    const ctx = context();
    await provider.translate(segments.slice(0, 1), ctx);
    await provider.translate(segments.slice(0, 1), ctx);
    expect(request.mock.calls.map(([options]) => options.url)).toEqual([
      "http://localhost:11434/api/tags",
      "http://localhost:11434/api/chat",
      "http://localhost:11434/api/chat",
    ]);
  });

  it("invalidates cancelled metadata validation and retries it on the next user action", async () => {
    let finish!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const provider = createProvider("ollama", local, {});
    const controller = new AbortController();
    const pending = provider.translate(
      segments.slice(0, 1),
      context(controller.signal),
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    finish({ models: [{ name: "qwen3:4b" }] });
    request
      .mockResolvedValueOnce({ models: [{ name: "qwen3:4b" }] })
      .mockResolvedValueOnce({
        done: true,
        message: {
          content: JSON.stringify({
            translations: [{ id: "first", text: "你好" }],
          }),
        },
      });
    await expect(
      provider.translate(segments.slice(0, 1), context()),
    ).resolves.toEqual([{ id: "first", text: "你好" }]);
    expect(request.mock.calls.map(([options]) => options.url)).toEqual([
      "http://localhost:11434/api/tags",
      "http://localhost:11434/api/tags",
      "http://localhost:11434/api/chat",
    ]);
  });
});

describe("Youdao signed adapter", () => {
  const settings = { endpoint: "https://openapi.youdao.com/api", model: "" };
  const credentials = { appKey: "test-app", appSecret: "test-secret" };
  it("signs unencoded Unicode text with code point length and maps Chinese language tags", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    request.mockResolvedValue({ errorCode: "0", translation: ["翻译结果"] });
    const text = "😀中文abcdefghij&klmnopqrst";
    const ctx = { ...context(), source: "zh-TW", target: "zh-CN" };
    expect(
      await createProvider("youdao", settings, credentials).translate(
        [{ id: "emoji", text }],
        ctx,
      ),
    ).toEqual([{ id: "emoji", text: "翻译结果" }]);
    const options = request.mock.calls[0]![0];
    const form = new URLSearchParams(options.data);
    const chars = Array.from(text);
    const input =
      chars.slice(0, 10).join("") + chars.length + chars.slice(-10).join("");
    const expected = createHash("sha256")
      .update(
        "test-app" +
          input +
          "00000000-0000-4000-8000-000000000001" +
          "1700000000" +
          "test-secret",
      )
      .digest("hex");
    expect(form.get("sign")).toBe(expected);
    expect(form.get("q")).toBe(text);
    expect(form.get("from")).toBe("zh-CHT");
    expect(form.get("to")).toBe("zh-CHS");
    expect(form.get("strict")).toBe("true");
    expect(form.get("signType")).toBe("v3");
    expect(options.data).not.toContain("test-secret");
  });

  it("handles the 20 code point signature boundary without splitting emoji", () => {
    expect(youdaoInput("😀".repeat(20))).toBe("😀".repeat(20));
    expect(youdaoInput("😀".repeat(21))).toBe(
      "😀".repeat(10) + "21" + "😀".repeat(10),
    );
  });

  it.each([
    ["401", false, "余额不足"],
    ["411", true, "频率受限"],
    ["202", false, "签名校验"],
    ["110", false, "绑定"],
  ])(
    "maps business error %s without relying on HTTP status",
    async (errorCode, retryable, message) => {
      request.mockResolvedValue({ errorCode });
      await expect(
        createProvider("youdao", settings, credentials).translate(
          segments.slice(0, 1),
          context(),
        ),
      ).rejects.toMatchObject({
        code: `youdao:${errorCode}`,
        retryable,
        message: expect.stringContaining(message),
      });
    },
  );

  it.each([
    {},
    { errorCode: "0", translation: [] },
    { errorCode: "0", translation: [" "] },
    { errorCode: "0", translation: [42] },
  ])("rejects invalid or empty translations", async (response) => {
    request.mockResolvedValue(response);
    await expect(
      createProvider("youdao", settings, credentials).translate(
        segments.slice(0, 1),
        context(),
      ),
    ).rejects.toMatchObject({ code: "response" });
  });

  it("cancels the batch before subsequent signed requests", async () => {
    const controller = new AbortController();
    request.mockImplementationOnce(async () => {
      controller.abort();
      return { errorCode: "0", translation: ["一"] };
    });
    await expect(
      createProvider("youdao", settings, credentials).translate(
        segments,
        context(controller.signal),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("browser native adapter", () => {
  function enableNative(
    create: (...args: unknown[]) => unknown,
    active = true,
  ) {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { userActivation: { isActive: active } });
    vi.stubGlobal("Translator", fakeNativeFactory(create));
  }

  it("fails with local guidance when the sandbox has no native API", async () => {
    vi.stubGlobal("Translator", undefined);
    const provider = createProvider("browser", { endpoint: "", model: "" }, {});
    await expect(provider.translate(segments, context())).rejects.toMatchObject(
      {
        code: "unavailable",
        message: expect.stringContaining("Ollama"),
      },
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a webpage JavaScript replacement and does not invoke it", async () => {
    const create = vi.fn();
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal(
      "Translator",
      Object.assign(function Translator() {}, { create }),
    );
    await expect(
      createProvider("browser", { endpoint: "", model: "" }, {}).healthCheck(),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("calls native create before yielding and reuses the language pair without another activation", async () => {
    const translate = vi.fn().mockResolvedValue("你好");
    const create = vi.fn().mockResolvedValue({ translate, destroy: vi.fn() });
    enableNative(create);
    const provider = createProvider("browser", { endpoint: "", model: "" }, {});
    const ctx = context();
    const promise = provider.translate(segments.slice(0, 1), ctx);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      sourceLanguage: "en",
      targetLanguage: "zh",
      signal: ctx.signal,
    });
    await expect(promise).resolves.toEqual([{ id: "first", text: "你好" }]);
    vi.stubGlobal("navigator", { userActivation: { isActive: false } });
    await provider.translate(segments.slice(0, 1), ctx);
    expect(create).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]![1]).toEqual({ signal: ctx.signal });
  });

  it("requires activation and an explicit source before first model creation", async () => {
    const create = vi.fn();
    enableNative(create, false);
    const provider = createProvider("browser", { endpoint: "", model: "" }, {});
    await expect(provider.translate(segments, context())).rejects.toMatchObject(
      { code: "activation" },
    );
    await expect(
      provider.translate(segments, { ...context(), source: "auto" }),
    ).rejects.toMatchObject({ code: "language" });
    expect(create).not.toHaveBeenCalled();
  });

  it("preserves cancellation even when a native download has not settled", async () => {
    const create = vi.fn().mockReturnValue(new Promise(() => {}));
    enableNative(create);
    const controller = new AbortController();
    const promise = createProvider(
      "browser",
      { endpoint: "", model: "" },
      {},
    ).translate(segments, context(controller.signal));
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("destroys a resolved native translator session when stopped and clears its cached instance", async () => {
    const destroy = vi.fn();
    enableNative(
      vi.fn().mockResolvedValue({
        translate: vi.fn().mockResolvedValue("你好"),
        destroy,
      }),
    );
    const controller = new AbortController();
    const provider = createProvider("browser", { endpoint: "", model: "" }, {});
    await provider.translate(segments.slice(0, 1), context(controller.signal));
    controller.abort();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledTimes(1);
    vi.stubGlobal("navigator", { userActivation: { isActive: false } });
    await expect(
      provider.translate(segments.slice(0, 1), context()),
    ).rejects.toMatchObject({ code: "activation" });
  });

  it("destroys an already resolved language detector when stopped", async () => {
    const destroy = vi.fn();
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { userActivation: { isActive: true } });
    vi.stubGlobal(
      "LanguageDetector",
      fakeNativeFactory(
        vi.fn().mockResolvedValue({
          detect: vi
            .fn()
            .mockResolvedValue([{ detectedLanguage: "en", confidence: 0.95 }]),
          destroy,
        }),
      ),
    );
    const controller = new AbortController();
    const provider = createProvider("browser", { endpoint: "", model: "" }, {});
    expect(
      await provider.detectLanguage!("Text to detect.", controller.signal),
    ).toBe("en");
    controller.abort();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("does not download a detector model and consume activation needed by translation", async () => {
    const create = vi.fn();
    const availability = vi.fn().mockResolvedValue("downloadable");
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { userActivation: { isActive: true } });
    vi.stubGlobal("LanguageDetector", fakeNativeFactory(create, availability));
    const provider = createProvider("browser", { endpoint: "", model: "" }, {});
    expect(
      await provider.detectLanguage!(
        "Text to detect.",
        new AbortController().signal,
      ),
    ).toBeNull();
    expect(availability).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("maps unsupported language errors into an actionable Chinese message", async () => {
    enableNative(
      vi
        .fn()
        .mockRejectedValue(
          new DOMException("unsupported", "NotSupportedError"),
        ),
    );
    await expect(
      createProvider("browser", { endpoint: "", model: "" }, {}).translate(
        segments,
        context(),
      ),
    ).rejects.toMatchObject({
      code: "browser",
      message: expect.stringContaining("不支持所选语言方向"),
    });
  });

  it("returns unknown for uncertain language detection instead of guessing", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { userActivation: { isActive: true } });
    vi.stubGlobal(
      "LanguageDetector",
      fakeNativeFactory(
        vi.fn().mockResolvedValue({
          detect: vi
            .fn()
            .mockResolvedValue([{ detectedLanguage: "en", confidence: 0.3 }]),
          destroy: vi.fn(),
        }),
      ),
    );
    const provider = createProvider("browser", { endpoint: "", model: "" }, {});
    expect(
      await provider.detectLanguage!(
        "A sufficiently long ambiguous input.",
        new AbortController().signal,
      ),
    ).toBeNull();
  });
});
