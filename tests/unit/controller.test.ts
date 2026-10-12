import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationController } from "../../src/translation/controller";
import { defaultSettings } from "../../src/settings/config";
import {
  TranslationError,
  type Segment,
  type Settings,
  type TranslationProvider,
  type TranslationResult,
} from "../../src/types";
import { TranslationCache } from "../../src/translation/cache";
import { canonicalLanguage, splitText } from "../../src/translation/text";

function setup(overrides: Partial<TranslationProvider> = {}) {
  const settings: Settings = {
    ...defaultSettings(),
    provider: "openai",
    sourceLanguage: "en",
  };
  const provider: TranslationProvider = {
    id: "openai",
    capabilities: { maxChars: 1000, concurrency: 2, requiresSource: false },
    translate: vi.fn(async (segments: Segment[]) =>
      segments.map((s) => ({ id: s.id, text: `译：${s.text}` })),
    ),
    healthCheck: async () => "ok",
    ...overrides,
  };
  return {
    settings,
    provider,
    controller: new TranslationController(() => provider),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  document.body.innerHTML = "<p>Hello world</p>";
  document.documentElement.lang = "en";
});

describe("translation lifecycle", () => {
  it("renders translated text and restores original link listeners", async () => {
    document.body.innerHTML = '<p>Hello <a href="/test">world</a></p>';
    const link = document.querySelector("a")!;
    const clicked = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", clicked);
    const { controller, settings } = setup();
    controller.start(settings);
    await vi.waitFor(() =>
      expect(
        document.querySelector("[data-opt-translation]")?.textContent,
      ).toBe("译：Hello world"),
    );
    controller.restore();
    expect(document.querySelector("a")).toBe(link);
    link.click();
    expect(clicked).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-opt-translation]")).toBeNull();
  });
  it("never renders a late response after stop", async () => {
    const pending = deferred<TranslationResult[]>();
    const translate = vi.fn(() => pending.promise);
    const { controller, settings } = setup({ translate });
    controller.start(settings);
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());
    controller.stop();
    pending.resolve([{ id: "0", text: "late" }]);
    await pending.promise;
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector("[data-opt-translation]")).toBeNull();
  });
  it("changing source text discards old response and translates current text", async () => {
    const old = deferred<TranslationResult[]>();
    const translate = vi.fn(async (segments) =>
      segments[0]?.text === "Hello world"
        ? old.promise
        : [{ id: "0", text: "新内容" }],
    );
    const { controller, settings } = setup({ translate });
    controller.start(settings);
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());
    document.querySelector("p")!.textContent = "Changed content";
    controller.scan(document.querySelector("p")!);
    await vi.waitFor(() =>
      expect(
        document.querySelector("[data-opt-translation]")?.textContent,
      ).toBe("新内容"),
    );
    old.resolve([{ id: "0", text: "old content" }]);
    await old.promise;
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector("[data-opt-translation]")?.textContent).toBe(
      "新内容",
    );
    controller.stop();
  });
  it("deduplicates identical page text and reuses cache when restarted", async () => {
    document.body.innerHTML = "<p>Hello world</p><p>Hello world</p>";
    const { controller, settings, provider } = setup();
    controller.start(settings);
    await vi.waitFor(() =>
      expect(document.querySelectorAll("[data-opt-translation]")).toHaveLength(
        2,
      ),
    );
    expect(provider.translate).toHaveBeenCalledOnce();
    controller.start(settings);
    await vi.waitFor(() =>
      expect(document.querySelectorAll("[data-opt-translation]")).toHaveLength(
        2,
      ),
    );
    expect(provider.translate).toHaveBeenCalledOnce();
    controller.stop();
  });
  it("clears a previous translation when dynamic source becomes target-language text", async () => {
    const { controller, settings } = setup();
    controller.start({ ...settings, sourceLanguage: "auto" });
    await vi.waitFor(() =>
      expect(document.querySelector("[data-opt-translation]")).not.toBeNull(),
    );
    document.querySelector("p")!.firstChild!.nodeValue = "现在是中文原文";
    controller.scan(document.querySelector("p")!);
    await vi.waitFor(() =>
      expect(document.querySelector("[data-opt-translation]")).toBeNull(),
    );
    controller.stop();
  });
  it("reads geometry once per queued block rather than sorting with layout reads", async () => {
    document.body.innerHTML = Array.from(
      { length: 100 },
      (_, i) => `<p>paragraph ${i}</p>`,
    ).join("");
    const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const { controller, settings } = setup();
    controller.start(settings);
    await vi.waitFor(() =>
      expect(document.querySelectorAll("[data-opt-translation]")).toHaveLength(
        100,
      ),
    );
    expect(geometry.mock.calls.length).toBeLessThanOrEqual(150);
    geometry.mockRestore();
    controller.stop();
  });
  it("does not share pending requests across independent cancellation signals", async () => {
    const pending = deferred<TranslationResult[]>();
    const translate = vi.fn(() => pending.promise);
    const { controller, settings } = setup({ translate });
    controller.start(settings);
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());
    const selection = controller.translateSelection(
      "Hello world",
      settings,
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2));
    controller.stop();
    pending.resolve([{ id: "0", text: "selection text" }]);
    expect(await selection).toBe("selection text");
  });
  it("separates cache by target language", async () => {
    const { controller, settings, provider } = setup();
    controller.start(settings);
    await vi.waitFor(() =>
      expect(document.querySelector("[data-opt-translation]")).not.toBeNull(),
    );
    controller.start({ ...settings, targetLanguage: "ja" });
    await vi.waitFor(() => expect(provider.translate).toHaveBeenCalledTimes(2));
    controller.stop();
  });
  it("splits long content within provider limits", async () => {
    document.querySelector("p")!.textContent = "A sentence. ".repeat(50);
    const { controller, settings, provider } = setup({
      capabilities: { maxChars: 100, concurrency: 1, requiresSource: false },
    });
    controller.start(settings);
    await vi.waitFor(() =>
      expect(document.querySelector("[data-opt-translation]")).not.toBeNull(),
    );
    const calls = vi.mocked(provider.translate).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect(
      calls.every(([segments]) => Array.from(segments[0]!.text).length <= 100),
    ).toBe(true);
    controller.stop();
  });
  it("does not translate content already in target language", async () => {
    document.querySelector("p")!.textContent = "这是一段中文内容";
    const { controller, settings, provider } = setup();
    controller.start({ ...settings, sourceLanguage: "auto" });
    await new Promise((r) => setTimeout(r, 10));
    expect(provider.translate).not.toHaveBeenCalled();
    controller.stop();
  });
  it("stops queued work when credentials fail", async () => {
    document.body.innerHTML = "<p>One</p><p>Two</p><p>Three</p>";
    const translate = vi.fn(async () => {
      throw new TranslationError("No key", "config");
    });
    const { controller, settings } = setup({
      translate,
      capabilities: { maxChars: 100, concurrency: 1, requiresSource: false },
    });
    controller.start(settings);
    await vi.waitFor(() => expect(controller.running).toBe(false));
    expect(translate).toHaveBeenCalledOnce();
  });
  it("rejects mismatched results without inserting unrelated text", async () => {
    const { controller, settings } = setup({
      translate: async () => [{ id: "wrong", text: "bad" }],
    });
    controller.start(settings);
    await vi.waitFor(() =>
      expect(
        document.querySelector("[data-opt-translation]")?.textContent,
      ).toContain("翻译结果"),
    );
    expect(
      document.querySelector("[data-opt-translation]")?.textContent,
    ).not.toContain("bad");
    controller.stop();
  });
});

describe("bounded cache and splitting", () => {
  it("evicts oldest entries and updates recency on read", () => {
    const cache = new TranslationCache(2);
    cache.set("a", "a");
    cache.set("b", "b");
    cache.get("a");
    cache.set("c", "c");
    expect(cache.get("a")).toBe("a");
    expect(cache.get("b")).toBeUndefined();
    cache.clear();
    expect(cache.get("c")).toBeUndefined();
  });
  it("does not retain oversized page text", () => {
    const cache = new TranslationCache(10, 4);
    cache.set("aaa", "bbb");
    expect(cache.get("aaa")).toBeUndefined();
  });
  it("preserves astral characters and every source character", () => {
    const text = "Hello. 🌏你好！ ".repeat(4);
    const parts = splitText(text, 12);
    expect(parts.join("")).toBe(text);
    expect(parts.every((p) => Array.from(p).length <= 12)).toBe(true);
  });
  it("normalizes Chinese variants without confusing traditional and simplified", () => {
    expect(canonicalLanguage("zh-TW")).toBe("zh-Hant");
    expect(canonicalLanguage("zh-CHS")).toBe("zh-Hans");
  });
});
