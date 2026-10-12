export type ProviderId =
  "browser" | "ollama" | "deepseek" | "openai" | "youdao";
export interface ProviderConfig {
  endpoint: string;
  model: string;
}
export interface Credentials {
  apiKey?: string;
  appKey?: string;
  appSecret?: string;
}
export interface Settings {
  version: 1;
  provider: ProviderId;
  sourceLanguage: string;
  targetLanguage: string;
  concurrency: number;
  providers: Record<ProviderId, ProviderConfig>;
  siteRules: Record<string, "auto" | "off">;
}
export interface Segment {
  id: string;
  text: string;
}
export interface TranslationResult {
  id: string;
  text: string;
}
export interface TranslationContext {
  source: string;
  target: string;
  signal: AbortSignal;
}
export interface TranslationProvider {
  id: ProviderId;
  capabilities: {
    maxChars: number;
    concurrency: number;
    requiresSource: boolean;
  };
  translate(
    segments: Segment[],
    context: TranslationContext,
  ): Promise<TranslationResult[]>;
  healthCheck(signal?: AbortSignal): Promise<string>;
  detectLanguage?(text: string, signal: AbortSignal): Promise<string | null>;
}
export interface TextBlock {
  id: string;
  element: HTMLElement;
  text: string;
}
export interface Progress {
  state: "idle" | "running" | "stopped" | "error";
  total: number;
  done: number;
  failed: number;
  message: string;
}
export class TranslationError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "TranslationError";
  }
}
