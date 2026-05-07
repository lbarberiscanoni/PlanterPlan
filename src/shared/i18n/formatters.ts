import { i18n } from '@/shared/i18n';
import { addDaysToDate, diffInCalendarDays, getNow } from '@/shared/lib/date-engine';

const currentLocale = (): string => i18n.language || 'en';

// Intl formatter construction is non-trivial; cache by (locale, options) so
// hot render paths (tables, lists) don't re-allocate on every cell. Keys stay
// small — locales × the handful of fixed option shapes we render with.
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();
const relativeTimeFormatCache = new Map<string, Intl.RelativeTimeFormat>();

function getDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = dateTimeFormatCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(key, cached);
  }
  return cached;
}

function getNumberFormat(
  locale: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}|${options ? JSON.stringify(options) : ''}`;
  let cached = numberFormatCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, cached);
  }
  return cached;
}

function getRelativeTimeFormat(locale: string): Intl.RelativeTimeFormat {
  let cached = relativeTimeFormatCache.get(locale);
  if (!cached) {
    cached = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeTimeFormatCache.set(locale, cached);
  }
  return cached;
}

/**
 * Locale-aware date formatter for DISPLAY only. Internal date math (sorting,
 * comparison, persistence, ISO parsing) lives in `@/shared/lib/date-engine`.
 */
export function formatDateLocalized(
  iso: string | null,
  format: 'short' | 'long' | 'relative',
): string {
  if (!iso) return '';
  const d = addDaysToDate(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00.000Z` : iso, 0);
  if (!d) return '';
  const locale = currentLocale();
  if (format === 'relative') {
    const diffDays = diffInCalendarDays(d, getNow());
    if (diffDays === null) return '';
    const rtf = getRelativeTimeFormat(locale);
    // RelativeTimeFormat 'day' is the finest-grained unit we render. For
    // horizons beyond a month step up to calendar-month buckets via the
    // date-engine-provided calendar-day diff.
    if (Math.abs(diffDays) < 30) return rtf.format(diffDays, 'day');
    return rtf.format(Math.trunc(diffDays / 30), 'month');
  }
  return getDateTimeFormat(locale, {
    dateStyle: format === 'long' ? 'full' : 'medium',
  }).format(d);
}

export function formatNumberLocalized(n: number, opts?: Intl.NumberFormatOptions): string {
  return getNumberFormat(currentLocale(), opts).format(n);
}

export function formatCurrencyLocalized(n: number, currency = 'USD'): string {
  return getNumberFormat(currentLocale(), { style: 'currency', currency }).format(n);
}
