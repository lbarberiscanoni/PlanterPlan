import { addDays, differenceInCalendarDays, isValid, parseISO } from 'date-fns';

/**
 * Business-calendar abstraction for PlanterPlan scheduling.
 *
 * The default calendar intentionally preserves calendar-day compatibility:
 * every valid date is treated as a business day, so Friday + 1 business day is
 * Saturday. Active date-kind project scheduling uses
 * {@link dateProjectBusinessCalendar}, which skips weekends and nationwide US
 * federal observed holidays.
 */

export type BusinessCalendarId = 'calendar-day' | 'weekday' | 'us-federal-observed';
export type BusinessCalendarDateInput = string | Date;

export interface BusinessCalendar {
 readonly id: BusinessCalendarId;
 /**
  * Checks whether a date is usable by the calendar.
  * @param date - Date input to validate.
  * @returns True when the date is valid and included by this calendar.
  */
 isBusinessDay(date: BusinessCalendarDateInput | null | undefined): boolean;
 /**
  * Adds business days to a date using this calendar's rules.
  * @param date - Starting date.
  * @param amount - Number of business days to add; negative values subtract.
  * @returns Resulting date, or null when the input is invalid.
  */
 addBusinessDays(date: BusinessCalendarDateInput | null | undefined, amount: number): Date | null;
 /**
  * Calculates `later - earlier` in this calendar's business-day units.
  * @param later - Later date input.
  * @param earlier - Earlier date input.
  * @returns Signed business-day difference, or null when either input is invalid.
  */
 diffInBusinessDays(
  later: BusinessCalendarDateInput | null | undefined,
  earlier: BusinessCalendarDateInput | null | undefined,
 ): number | null;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const usFederalObservedHolidayCache = new Map<number, Set<string>>();

const parseDateOnlyParts = (input: string): [number, number, number] | null => {
 const match = DATE_ONLY_RE.exec(input);
 if (!match) return null;
 const [, yearRaw, monthRaw, dayRaw] = match;
 const year = Number(yearRaw);
 const month = Number(monthRaw);
 const day = Number(dayRaw);
 const utc = new Date(Date.UTC(year, month - 1, day));
 if (
  utc.getUTCFullYear() !== year ||
  utc.getUTCMonth() !== month - 1 ||
  utc.getUTCDate() !== day
 ) {
  return null;
 }
 return [year, month, day];
};

const dateOnlyToUtcMidnightMs = (input: string): number | null => {
 const parts = parseDateOnlyParts(input);
 if (!parts) return null;
 const [year, month, day] = parts;
 return Date.UTC(year, month - 1, day);
};

const addUtcDateOnlyDays = (input: string, amount: number): Date | null => {
 const parts = parseDateOnlyParts(input);
 if (!parts) return null;
 const [year, month, day] = parts;
 return new Date(Date.UTC(year, month - 1, day + amount));
};

/**
 * Formats a date as a UTC `YYYY-MM-DD` string.
 * @param date - Date to format.
 * @returns UTC date-only string.
 */
const toUtcDateOnly = (date: Date): string => {
 const year = date.getUTCFullYear();
 const month = String(date.getUTCMonth() + 1).padStart(2, '0');
 const day = String(date.getUTCDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
};

/**
 * Builds a UTC date-only string from numeric date parts.
 * @param year - UTC year.
 * @param month - One-based UTC month.
 * @param day - UTC day of month.
 * @returns UTC date-only string.
 */
const fromUtcDateOnlyParts = (year: number, month: number, day: number): string => (
 toUtcDateOnly(new Date(Date.UTC(year, month - 1, day)))
);

/**
 * Checks whether a date falls on Saturday or Sunday in UTC.
 * @param date - Date to inspect.
 * @returns True when the UTC weekday is Saturday or Sunday.
 */
const isWeekendUtc = (date: Date): boolean => {
 const day = date.getUTCDay();
 return day === 0 || day === 6;
};

/**
 * Adds calendar days using UTC date-only semantics.
 * @param date - Date to shift.
 * @param amount - Number of calendar days to add; negative subtracts.
 * @returns Shifted UTC date.
 */
const addDaysUtc = (date: Date, amount: number): Date => (
 new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount))
);

/**
 * Finds the Nth weekday in a UTC month.
 * @param year - UTC year.
 * @param month - One-based UTC month.
 * @param weekday - UTC weekday, where 0 is Sunday.
 * @param occurrence - One-based occurrence to find.
 * @returns UTC date-only string for the matched weekday.
 */
const nthWeekdayOfMonth = (year: number, month: number, weekday: number, occurrence: number): string => {
 const first = new Date(Date.UTC(year, month - 1, 1));
 const offset = (weekday - first.getUTCDay() + 7) % 7;
 return fromUtcDateOnlyParts(year, month, 1 + offset + (occurrence - 1) * 7);
};

/**
 * Finds the last matching weekday in a UTC month.
 * @param year - UTC year.
 * @param month - One-based UTC month.
 * @param weekday - UTC weekday, where 0 is Sunday.
 * @returns UTC date-only string for the matched weekday.
 */
const lastWeekdayOfMonth = (year: number, month: number, weekday: number): string => {
 const last = new Date(Date.UTC(year, month, 0));
 const offset = (last.getUTCDay() - weekday + 7) % 7;
 return fromUtcDateOnlyParts(year, month, last.getUTCDate() - offset);
};

/**
 * Applies US federal observed-date rules to a fixed-date holiday.
 * @param year - Legal holiday year.
 * @param month - One-based legal holiday month.
 * @param day - Legal holiday day of month.
 * @returns Observed UTC date-only string.
 */
const observedFixedHoliday = (year: number, month: number, day: number): string => {
 const holiday = new Date(Date.UTC(year, month - 1, day));
 const weekday = holiday.getUTCDay();
 if (weekday === 6) return toUtcDateOnly(addDaysUtc(holiday, -1));
 if (weekday === 0) return toUtcDateOnly(addDaysUtc(holiday, 1));
 return toUtcDateOnly(holiday);
};

/**
 * Builds and caches nationwide US federal observed holidays for one year.
 * @param year - Calendar year whose legal holidays should be generated.
 * @returns Set of observed UTC date-only strings.
 */
const getUsFederalObservedHolidaysForYear = (year: number): Set<string> => {
 const cached = usFederalObservedHolidayCache.get(year);
 if (cached) return cached;

 const holidays = new Set<string>([
  observedFixedHoliday(year, 1, 1),
  nthWeekdayOfMonth(year, 1, 1, 3),
  nthWeekdayOfMonth(year, 2, 1, 3),
  lastWeekdayOfMonth(year, 5, 1),
  observedFixedHoliday(year, 7, 4),
  nthWeekdayOfMonth(year, 9, 1, 1),
  nthWeekdayOfMonth(year, 10, 1, 2),
  observedFixedHoliday(year, 11, 11),
  nthWeekdayOfMonth(year, 11, 4, 4),
  observedFixedHoliday(year, 12, 25),
 ]);

 if (year >= 2021) {
  holidays.add(observedFixedHoliday(year, 6, 19));
 }

 usFederalObservedHolidayCache.set(year, holidays);
 return holidays;
};

/**
 * Checks whether a date is a nationwide US federal observed holiday.
 * @param date - Date to inspect.
 * @returns True when the UTC date matches an observed holiday.
 */
const isUsFederalObservedHoliday = (date: Date): boolean => {
 const isoDate = toUtcDateOnly(date);
 const year = date.getUTCFullYear();
 return (
  getUsFederalObservedHolidaysForYear(year - 1).has(isoDate) ||
  getUsFederalObservedHolidaysForYear(year).has(isoDate) ||
  getUsFederalObservedHolidaysForYear(year + 1).has(isoDate)
 );
};

/**
 * Resolves a business-calendar input to a Date.
 * @param input - Date input to resolve.
 * @returns A valid Date or null when the input is empty/invalid.
 */
const resolveBusinessDate = (input: BusinessCalendarDateInput | null | undefined): Date | null => {
 if (!input) return null;
 if (typeof input === 'string' && DATE_ONLY_RE.test(input)) {
  const utcMidnightMs = dateOnlyToUtcMidnightMs(input);
  return utcMidnightMs === null ? null : new Date(utcMidnightMs);
 }
 const date = typeof input === 'string' ? parseISO(input) : input;
 return isValid(date) ? date : null;
};

/**
 * Creates a business calendar that skips dates rejected by a predicate.
 * @param id - Stable business-calendar identifier.
 * @param isExcludedDate - Predicate returning true for skipped UTC dates.
 * @returns BusinessCalendar implementation.
 */
const createSkippingBusinessCalendar = (
 id: Exclude<BusinessCalendarId, 'calendar-day'>,
 isExcludedDate: (date: Date) => boolean,
): BusinessCalendar => {
 const isIncluded = (date: Date): boolean => !isExcludedDate(date);

 return {
  id,

  isBusinessDay(date) {
   const resolved = resolveBusinessDate(date);
   return resolved !== null && isIncluded(resolved);
  },

  addBusinessDays(date, amount) {
   const resolved = resolveBusinessDate(date);
   if (!resolved) return null;
   if (amount === 0) {
    return new Date(Date.UTC(
     resolved.getUTCFullYear(),
     resolved.getUTCMonth(),
     resolved.getUTCDate(),
    ));
   }

   const direction = amount > 0 ? 1 : -1;
   let remaining = Math.abs(amount);
   let cursor = new Date(Date.UTC(
    resolved.getUTCFullYear(),
    resolved.getUTCMonth(),
    resolved.getUTCDate(),
   ));

   while (remaining > 0) {
    cursor = addDaysUtc(cursor, direction);
    if (isIncluded(cursor)) remaining -= 1;
   }

   return cursor;
  },

  diffInBusinessDays(later, earlier) {
   const resolvedLater = resolveBusinessDate(later);
   const resolvedEarlier = resolveBusinessDate(earlier);
   if (!resolvedLater || !resolvedEarlier) return null;

   const laterDate = new Date(Date.UTC(
    resolvedLater.getUTCFullYear(),
    resolvedLater.getUTCMonth(),
    resolvedLater.getUTCDate(),
   ));
   const earlierDate = new Date(Date.UTC(
    resolvedEarlier.getUTCFullYear(),
    resolvedEarlier.getUTCMonth(),
    resolvedEarlier.getUTCDate(),
   ));
   const laterMs = laterDate.getTime();
   const earlierMs = earlierDate.getTime();
   if (laterMs === earlierMs) return 0;

   const direction = laterMs > earlierMs ? 1 : -1;
   let cursor = earlierDate;
   let count = 0;

   while (cursor.getTime() !== laterMs) {
    cursor = addDaysUtc(cursor, direction);
    if (isIncluded(cursor)) count += direction;
   }

   return count;
  },
 };
};

export const calendarDayBusinessCalendar: BusinessCalendar = {
 id: 'calendar-day',

 isBusinessDay(date) {
  return resolveBusinessDate(date) !== null;
 },

 addBusinessDays(date, amount) {
  if (typeof date === 'string' && DATE_ONLY_RE.test(date)) {
   return addUtcDateOnlyDays(date, amount);
  }
  const resolved = resolveBusinessDate(date);
  if (!resolved) return null;
  return addDays(resolved, amount);
 },

 diffInBusinessDays(later, earlier) {
  if (
   typeof later === 'string' &&
   typeof earlier === 'string' &&
   DATE_ONLY_RE.test(later) &&
   DATE_ONLY_RE.test(earlier)
  ) {
   const laterMs = dateOnlyToUtcMidnightMs(later);
   const earlierMs = dateOnlyToUtcMidnightMs(earlier);
   if (laterMs === null || earlierMs === null) return null;
   return Math.round((laterMs - earlierMs) / MS_PER_DAY);
  }
  const resolvedLater = resolveBusinessDate(later);
  const resolvedEarlier = resolveBusinessDate(earlier);
  if (!resolvedLater || !resolvedEarlier) return null;
  return differenceInCalendarDays(resolvedLater, resolvedEarlier);
 },
};

export const weekdayBusinessCalendar: BusinessCalendar = createSkippingBusinessCalendar(
 'weekday',
 isWeekendUtc,
);

export const usFederalObservedBusinessCalendar: BusinessCalendar = createSkippingBusinessCalendar(
 'us-federal-observed',
 (date) => isWeekendUtc(date) || isUsFederalObservedHoliday(date),
);

/**
 * Calendar used by active date-kind project scheduling and urgency.
 *
 * `defaultBusinessCalendar` remains calendar-day for compatibility wrappers
 * whose names and callers still mean literal calendar-day math.
 */
export const dateProjectBusinessCalendar = usFederalObservedBusinessCalendar;

export const defaultBusinessCalendar = calendarDayBusinessCalendar;
