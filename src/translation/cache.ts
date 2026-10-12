export class TranslationCache {
  private values = new Map<string, string>();
  private size = 0;
  constructor(
    private maxEntries = 500,
    private maxCharacters = 500000,
  ) {}
  get(key: string): string | undefined {
    const value = this.values.get(key);
    if (value !== undefined) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }
  set(key: string, value: string): void {
    const old = this.values.get(key);
    if (old !== undefined) {
      this.size -= key.length + old.length;
      this.values.delete(key);
    }
    this.values.set(key, value);
    this.size += key.length + value.length;
    while (
      this.values.size > this.maxEntries ||
      this.size > this.maxCharacters
    ) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.size -= oldest.length + this.values.get(oldest)!.length;
      this.values.delete(oldest);
    }
  }
  clear(): void {
    this.values.clear();
    this.size = 0;
  }
}
