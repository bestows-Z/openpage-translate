import { getStored, setStored } from "../platform/gm";
import type { Credentials, ProviderId, Settings } from "../types";

export const providerIds: ProviderId[] = [
  "browser",
  "ollama",
  "deepseek",
  "openai",
  "youdao",
];
export function defaultSettings(): Settings {
  return {
    version: 1,
    provider: "browser",
    sourceLanguage: "auto",
    targetLanguage: "zh-Hans",
    concurrency: 2,
    providers: {
      browser: { endpoint: "", model: "" },
      ollama: { endpoint: "http://127.0.0.1:11434", model: "qwen3:4b" },
      deepseek: {
        endpoint: "https://api.deepseek.com",
        model: "deepseek-flash",
      },
      openai: { endpoint: "https://api.openai.com/v1", model: "" },
      youdao: { endpoint: "https://openapi.youdao.com/api", model: "" },
    },
    siteRules: {},
  };
}
export function loadSettings(): Settings {
  const defaults = defaultSettings();
  const stored = getStored<Partial<Settings>>("settings", {});
  if (!stored || typeof stored !== "object") return defaults;
  const settings = {
    ...defaults,
    ...stored,
    version: 1 as const,
    providers: { ...defaults.providers },
    siteRules: {} as Settings["siteRules"],
  };
  for (const id of providerIds) {
    const c = stored.providers?.[id];
    if (c && typeof c.endpoint === "string" && typeof c.model === "string")
      settings.providers[id] = c;
  }
  if (!providerIds.includes(settings.provider))
    settings.provider = defaults.provider;
  if (typeof settings.sourceLanguage !== "string")
    settings.sourceLanguage = "auto";
  if (typeof settings.targetLanguage !== "string" || !settings.targetLanguage)
    settings.targetLanguage = "zh-Hans";
  settings.concurrency = Math.max(
    1,
    Math.min(4, Number(settings.concurrency) || 2),
  );
  if (stored.siteRules && typeof stored.siteRules === "object") {
    for (const [host, rule] of Object.entries(stored.siteRules))
      if (rule === "auto" || rule === "off") settings.siteRules[host] = rule;
  }
  return settings;
}
export function saveSettings(settings: Settings): void {
  setStored("settings", settings);
}
export function getCredentials(id: ProviderId): Credentials {
  return getStored<Credentials>(`credentials:${id}`, {});
}
export function saveCredentials(
  id: ProviderId,
  credentials: Credentials,
): void {
  setStored(`credentials:${id}`, credentials);
}
