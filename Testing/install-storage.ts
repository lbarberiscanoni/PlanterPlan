// Swap jsdom's persistence-backed localStorage/sessionStorage for plain
// in-memory stores BEFORE any module imports them. jsdom 29 throws on
// `setItem` when `--localstorage-file` is absent, which trips
// `i18next-browser-languagedetector`'s one-shot `hasLocalStorageSupport`
// probe during i18n init and silently disables caching for the whole run.
// Importing this file first in `setupTests.ts` ensures the swap lands before
// `@/shared/i18n` initializes its detector.

class MemoryStorage implements Storage {
 private store = new Map<string, string>();
 get length(): number { return this.store.size; }
 clear(): void { this.store.clear(); }
 getItem(key: string): string | null {
  return this.store.get(key) ?? null;
 }
 key(index: number): string | null {
  const keys = Array.from(this.store.keys());
  return (index >= 0 && index < keys.length) ? keys[index] : null;
 }
 removeItem(key: string): void { this.store.delete(key); }
 setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

Object.defineProperty(window, 'localStorage', {
 value: new MemoryStorage(),
 writable: true,
 configurable: true,
});
Object.defineProperty(window, 'sessionStorage', {
 value: new MemoryStorage(),
 writable: true,
 configurable: true,
});
