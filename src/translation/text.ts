export function splitText(text: string, maxChars: number): string[] {
  const points = Array.from(text);
  if (points.length <= maxChars) return [text];
  const result: string[] = [];
  for (let start = 0; start < points.length;) {
    let end = Math.min(start + maxChars, points.length);
    if (end < points.length) {
      for (let i = end - 1; i > start + maxChars / 2; i--) {
        if (/[\s。！？.!?]/u.test(points[i]!)) {
          end = i + 1;
          break;
        }
      }
    }
    result.push(points.slice(start, end).join(""));
    start = end;
  }
  return result;
}
export function canonicalLanguage(language: string): string {
  const value = language.toLowerCase();
  if (value.startsWith("zh"))
    return value.includes("hant") || /-(tw|hk|cht)$/.test(value)
      ? "zh-Hant"
      : "zh-Hans";
  return value.split("-")[0] || "auto";
}
export function inferLanguage(text: string, pageHint = ""): string | null {
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/[\uac00-\ud7af]/u.test(text)) return "ko";
  const letters = Array.from(text).filter((c) => /\p{L}/u.test(c));
  const han = letters.filter((c) => /\p{Script=Han}/u.test(c)).length;
  if (letters.length && han / letters.length > 0.5)
    return pageHint.includes("Hant") || /-(TW|HK)$/i.test(pageHint)
      ? "zh-Hant"
      : "zh-Hans";
  if (pageHint && !pageHint.startsWith("zh") && /[a-zA-Z]/.test(text))
    return canonicalLanguage(pageHint);
  return null;
}
