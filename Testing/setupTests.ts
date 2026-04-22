// Storage swap runs before any other import so the in-memory polyfill is in
// place before `@/shared/i18n` initializes `i18next-browser-languagedetector`
// and probes `window.localStorage`. See `./install-storage` for the rationale.
import './install-storage';
import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
// Eager i18n init so components calling `useTranslation` resolve against
// en.json during unit tests. See Testing/test-utils/render-with-providers.tsx.
import { i18n } from '@/shared/i18n';

// Mocks for JSDOM
// Wave 30: Radix Select / Popover uses ResizeObserver; jsdom doesn't ship it.
class ResizeObserverStub {
 observe(): void {}
 unobserve(): void {}
 disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver ??= ResizeObserverStub;

Object.defineProperty(window, 'matchMedia', {
 writable: true,
 value: vi.fn().mockImplementation(query => ({
 matches: false,
 media: query,
 onchange: null,
 addListener: vi.fn(), // deprecated
 removeListener: vi.fn(), // deprecated
 addEventListener: vi.fn(),
 removeEventListener: vi.fn(),
 dispatchEvent: vi.fn(),
 })),
});

beforeEach(() => {
 window.localStorage.clear();
 window.sessionStorage.clear();
 if (i18n.language !== 'en') {
  void i18n.changeLanguage('en');
 }
});
