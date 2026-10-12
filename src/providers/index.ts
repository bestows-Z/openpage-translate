import type {
  Credentials,
  ProviderConfig,
  ProviderId,
  TranslationProvider,
} from "../types";
import { createBrowserProvider } from "./browser";
import { createLlmProvider } from "./llm";
import { createYoudaoProvider } from "./youdao";

export function createProvider(
  id: ProviderId,
  config: ProviderConfig,
  credentials: Credentials,
): TranslationProvider {
  if (id === "browser") return createBrowserProvider();
  if (id === "youdao") return createYoudaoProvider(config, credentials);
  return createLlmProvider(id, config, credentials);
}
