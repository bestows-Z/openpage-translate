import {
  collectBlocks,
  clearTranslations,
  getBlockText,
  renderError,
  renderTranslation,
} from "../page";
import { createProvider } from "../providers";
import { getCredentials } from "../settings/config";
import {
  TranslationError,
  type Progress,
  type Settings,
  type TextBlock,
  type TranslationProvider,
} from "../types";
import { TranslationCache } from "./cache";
import { canonicalLanguage, inferLanguage, splitText } from "./text";

type Factory = (settings: Settings) => TranslationProvider;
interface Job {
  block: TextBlock;
  generation: number;
  signal: AbortSignal;
  provider: TranslationProvider;
  settings: Settings;
  distance: number;
}
export class TranslationController {
  private generation = 0;
  private aborter = new AbortController();
  private provider?: TranslationProvider;
  private settings?: Settings;
  private seen = new WeakMap<HTMLElement, string>();
  private queue: Job[] = [];
  private inFlight = new Map<
    string,
    { promise: Promise<string>; signal: AbortSignal }
  >();
  private workers = 0;
  private active = false;
  private visible = new WeakSet<Element>();
  private intersection =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) this.visible.add(entry.target);
              else this.visible.delete(entry.target);
            }
            this.sortQueue();
          },
          { rootMargin: "250px" },
        )
      : undefined;
  private listeners = new Set<(progress: Progress) => void>();
  private cache = new TranslationCache();
  private progress: Progress = {
    state: "idle",
    total: 0,
    done: 0,
    failed: 0,
    message: "准备就绪",
  };
  constructor(
    private factory: Factory = (s) =>
      createProvider(
        s.provider,
        s.providers[s.provider],
        getCredentials(s.provider),
      ),
  ) {}
  get running(): boolean {
    return this.active;
  }
  subscribe(listener: (progress: Progress) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.progress });
    return () => this.listeners.delete(listener);
  }
  private emit(patch: Partial<Progress> = {}): void {
    Object.assign(this.progress, patch);
    for (const listener of this.listeners) listener({ ...this.progress });
  }
  start(settings: Settings): void {
    this.stop();
    this.seen = new WeakMap();
    clearTranslations();
    this.settings = structuredClone(settings);
    try {
      this.provider = this.factory(this.settings);
    } catch (error) {
      this.emit({ state: "error", message: this.errorMessage(error) });
      return;
    }
    this.active = true;
    this.aborter = new AbortController();
    this.progress = {
      state: "running",
      total: 0,
      done: 0,
      failed: 0,
      message: "正在识别页面…",
    };
    this.scan();
  }
  scan(root: ParentNode = document.body): void {
    if (!this.active || !this.provider || !this.settings) return;
    for (const rendered of root.querySelectorAll("[data-opt-translation]")) {
      const parent = rendered.parentElement;
      if (parent && !getBlockText(parent)) {
        rendered.remove();
        this.seen.delete(parent);
      }
    }
    const blocks = collectBlocks(root);
    for (const block of blocks) {
      if (this.seen.get(block.element) === block.text) continue;
      for (const child of Array.from(block.element.children)) {
        if (child.hasAttribute("data-opt-translation")) child.remove();
      }
      this.seen.set(block.element, block.text);
      this.queue.push({
        block,
        generation: this.generation,
        signal: this.aborter.signal,
        provider: this.provider,
        settings: this.settings,
        distance: this.distance(block.element),
      });
      this.intersection?.observe(block.element);
      this.progress.total++;
    }
    this.emit({
      message: this.progress.total
        ? "翻译中，可继续浏览页面"
        : "没有找到可翻译的正文",
    });
    this.sortQueue();
    this.pump();
  }
  invalidate(root: HTMLElement): void {
    for (const node of [
      root,
      ...root.querySelectorAll<HTMLElement>(
        "p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,div",
      ),
    ])
      this.seen.delete(node);
    clearTranslations(root);
  }
  stop(): void {
    this.active = false;
    this.generation++;
    this.aborter.abort();
    this.queue = [];
    this.workers = 0;
    this.inFlight.clear();
    this.intersection?.disconnect();
    this.visible = new WeakSet();
    this.emit({ state: "stopped", message: "已停止；已完成的译文保留" });
  }
  restore(): void {
    this.stop();
    clearTranslations();
    this.seen = new WeakMap();
    this.emit({
      state: "idle",
      total: 0,
      done: 0,
      failed: 0,
      message: "已还原页面",
    });
  }
  clearCache(): void {
    this.cache.clear();
    this.emit({ message: "已清除本页缓存" });
  }
  private pump(): void {
    if (!this.active || !this.settings || !this.provider) return;
    const limit = Math.min(
      this.settings.concurrency,
      this.provider.capabilities.concurrency,
    );
    while (this.workers < limit && this.queue.length) {
      const job = this.queue.shift()!;
      this.workers++;
      void this.runJob(job).finally(() => {
        if (job.generation !== this.generation) return;
        this.workers--;
        this.pump();
      });
    }
    if (!this.queue.length && this.workers === 0 && this.active) {
      this.emit({ state: "idle", message: "当前内容已处理；继续监听新内容" });
    }
  }
  private sortQueue(): void {
    const priority = (job: Job) =>
      this.visible.has(job.block.element) ? -1 : job.distance;
    this.queue.sort((a, b) => priority(a) - priority(b));
  }
  private distance(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top <= innerHeight ? 0 : Math.abs(rect.top);
  }
  private async source(
    text: string,
    settings: Settings,
    provider: TranslationProvider,
    signal: AbortSignal,
  ): Promise<string> {
    if (settings.sourceLanguage !== "auto") return settings.sourceLanguage;
    const hint = document.documentElement.lang;
    const inferred = inferLanguage(text, hint);
    // Local detector takes priority over a page's often inaccurate language hint.
    if (provider.detectLanguage) {
      const detected = await provider.detectLanguage(text, signal);
      if (detected) return canonicalLanguage(detected);
    }
    if (inferred) return inferred;
    if (provider.capabilities.requiresSource)
      throw new TranslationError(
        "无法识别源语言，请在设置中手动选择原文语言后重新翻译。",
        "language",
      );
    return "auto";
  }
  private async translate(
    text: string,
    settings: Settings,
    provider: TranslationProvider,
    signal: AbortSignal,
  ): Promise<string> {
    const source = await this.source(text, settings, provider, signal);
    if (
      canonicalLanguage(source) === canonicalLanguage(settings.targetLanguage)
    )
      return "";
    const key = JSON.stringify([
      provider.id,
      settings.providers[provider.id],
      source,
      settings.targetLanguage,
      "prompt-v1",
      text,
    ]);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const current = this.inFlight.get(key);
    if (current?.signal === signal) return current.promise;
    const promise = (async () => {
      const parts = splitText(text, provider.capabilities.maxChars);
      const translations: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const result = await this.withRetry(
          () =>
            provider.translate([{ id: String(i), text: parts[i]! }], {
              source,
              target: settings.targetLanguage,
              signal,
            }),
          signal,
        );
        const translated = result.find((item) => item.id === String(i));
        if (result.length !== 1 || !translated?.text.trim())
          throw new TranslationError("翻译结果为空或段落不对应。", "response");
        translations.push(translated.text);
      }
      const value = translations.join("\n");
      if (!signal.aborted) this.cache.set(key, value);
      return value;
    })();
    this.inFlight.set(key, { promise, signal });
    try {
      return await promise;
    } finally {
      if (this.inFlight.get(key)?.promise === promise)
        this.inFlight.delete(key);
    }
  }
  private async withRetry<T>(
    operation: () => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      try {
        return await operation();
      } catch (error) {
        if (
          !(error instanceof TranslationError) ||
          !error.retryable ||
          attempt >= 2
        )
          throw error;
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Cancelled", "AbortError"));
          };
          const timer = setTimeout(
            () => {
              signal.removeEventListener("abort", onAbort);
              resolve();
            },
            700 * 2 ** attempt,
          );
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) onAbort();
        });
      }
    }
  }
  private async runJob(job: Job): Promise<void> {
    const valid = () =>
      job.generation === this.generation &&
      !job.signal.aborted &&
      job.block.element.isConnected &&
      getBlockText(job.block.element) === job.block.text;
    try {
      const text = await this.translate(
        job.block.text,
        job.settings,
        job.provider,
        job.signal,
      );
      if (!valid()) return;
      if (text) renderTranslation(job.block, text);
      this.progress.done++;
      this.emit();
    } catch (error) {
      if (
        !valid() ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      const message = this.errorMessage(error);
      renderError(job.block, message, () => this.retry(job.block));
      this.progress.failed++;
      this.emit({ message });
      if (
        error instanceof TranslationError &&
        [
          "config",
          "401",
          "402",
          "403",
          "permission",
          "environment",
          "unavailable",
        ].includes(error.code)
      ) {
        this.stop();
        this.emit({ state: "error", message });
      }
    }
  }
  retry(block: TextBlock): void {
    if (!this.settings) return;
    if (!this.active) {
      this.start(this.settings);
      return;
    }
    this.seen.delete(block.element);
    this.scan(block.element);
  }
  async translateSelection(
    text: string,
    settings: Settings,
    signal: AbortSignal,
  ): Promise<string> {
    const provider = this.factory(settings);
    return (await this.translate(text, settings, provider, signal)) || text;
  }
  async healthCheck(settings: Settings, signal?: AbortSignal): Promise<string> {
    return this.factory(settings).healthCheck(signal);
  }
  private errorMessage(error: unknown): string {
    return error instanceof TranslationError
      ? error.message
      : "翻译失败，请检查引擎设置后重试。";
  }
}
