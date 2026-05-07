import {
    addDaysToIsoDate,
    dateStringToUtcMidnightMs,
    toUtcIsoDate,
} from './date.ts'

// Deno mirror of the frontend business-calendar seam. The default preserves
// calendar-day compatibility. Active date-kind project scheduling uses
// dateProjectBusinessCalendar, which skips weekends and nationwide US federal
// observed holidays.

export type BusinessCalendarId = 'calendar-day' | 'weekday' | 'us-federal-observed'

export interface BusinessCalendar {
    readonly id: BusinessCalendarId
    /**
     * Checks whether an ISO date/timestamp is usable by the calendar.
     * @param isoDate - ISO date or timestamp to validate.
     * @returns True when the input is valid and included by this calendar.
     */
    isBusinessDay(isoDate: string | null | undefined): boolean
    /**
     * Adds business days to an ISO date/timestamp using this calendar's rules.
     * @param isoDate - Starting ISO date or timestamp.
     * @param amount - Number of business days to add; negative values subtract.
     * @returns Resulting YYYY-MM-DD date, or null when the input is invalid.
     */
    addBusinessDays(isoDate: string | null | undefined, amount: number): string | null
    /**
     * Calculates `later - earlier` in this calendar's business-day units.
     * @param later - Later ISO date or timestamp.
     * @param earlier - Earlier ISO date or timestamp.
     * @returns Signed business-day difference, or null when either input is invalid.
     */
    diffInBusinessDays(
        later: string | null | undefined,
        earlier: string | null | undefined,
    ): number | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const usFederalObservedHolidayCache = new Map<number, Set<string>>()

const addUtcDays = (isoDate: string, amount: number): string | null => addDaysToIsoDate(isoDate, amount)

const isWeekendUtc = (isoDate: string): boolean => {
    const midnightMs = dateStringToUtcMidnightMs(isoDate)
    if (midnightMs === null) return false
    const day = new Date(midnightMs).getUTCDay()
    return day === 0 || day === 6
}

const isoDateFromParts = (year: number, month: number, day: number): string => (
    toUtcIsoDate(new Date(Date.UTC(year, month - 1, day)))
)

const nthWeekdayOfMonth = (year: number, month: number, weekday: number, occurrence: number): string => {
    const first = new Date(Date.UTC(year, month - 1, 1))
    const offset = (weekday - first.getUTCDay() + 7) % 7
    return isoDateFromParts(year, month, 1 + offset + (occurrence - 1) * 7)
}

const lastWeekdayOfMonth = (year: number, month: number, weekday: number): string => {
    const last = new Date(Date.UTC(year, month, 0))
    const offset = (last.getUTCDay() - weekday + 7) % 7
    return isoDateFromParts(year, month, last.getUTCDate() - offset)
}

const observedFixedHoliday = (year: number, month: number, day: number): string => {
    const holiday = new Date(Date.UTC(year, month - 1, day))
    const weekday = holiday.getUTCDay()
    if (weekday === 6) return toUtcIsoDate(new Date(Date.UTC(year, month - 1, day - 1)))
    if (weekday === 0) return toUtcIsoDate(new Date(Date.UTC(year, month - 1, day + 1)))
    return toUtcIsoDate(holiday)
}

const getUsFederalObservedHolidaysForYear = (year: number): Set<string> => {
    const cached = usFederalObservedHolidayCache.get(year)
    if (cached) return cached

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
    ])

    if (year >= 2021) {
        holidays.add(observedFixedHoliday(year, 6, 19))
    }

    usFederalObservedHolidayCache.set(year, holidays)
    return holidays
}

const isUsFederalObservedHoliday = (isoDate: string): boolean => {
    const midnightMs = dateStringToUtcMidnightMs(isoDate)
    if (midnightMs === null) return false
    const date = new Date(midnightMs)
    const normalized = toUtcIsoDate(date)
    const year = date.getUTCFullYear()
    return (
        getUsFederalObservedHolidaysForYear(year - 1).has(normalized) ||
        getUsFederalObservedHolidaysForYear(year).has(normalized) ||
        getUsFederalObservedHolidaysForYear(year + 1).has(normalized)
    )
}

/**
 * Normalizes an ISO date/timestamp to a UTC YYYY-MM-DD date.
 * @param raw - ISO date or timestamp to normalize.
 * @returns UTC date-only string, or null when the input is invalid.
 */
const normalizeToUtcIsoDate = (raw: string | null | undefined): string | null => {
    const midnightMs = dateStringToUtcMidnightMs(raw ?? null)
    if (midnightMs === null) return null
    return toUtcIsoDate(new Date(midnightMs))
}

const createSkippingBusinessCalendar = (
    id: Exclude<BusinessCalendarId, 'calendar-day'>,
    isExcludedDate: (isoDate: string) => boolean,
): BusinessCalendar => {
    const isIncluded = (isoDate: string): boolean => !isExcludedDate(isoDate)

    return {
        id,

        isBusinessDay(isoDate) {
            const normalized = normalizeToUtcIsoDate(isoDate)
            return normalized !== null && isIncluded(normalized)
        },

        addBusinessDays(isoDate, amount) {
            const normalized = normalizeToUtcIsoDate(isoDate)
            if (!normalized) return null
            if (amount === 0) return normalized

            const direction = amount > 0 ? 1 : -1
            let remaining = Math.abs(amount)
            let cursor = normalized

            while (remaining > 0) {
                const next = addUtcDays(cursor, direction)
                if (!next) return null
                cursor = next
                if (isIncluded(cursor)) remaining -= 1
            }

            return cursor
        },

        diffInBusinessDays(later, earlier) {
            const laterDate = normalizeToUtcIsoDate(later)
            const earlierDate = normalizeToUtcIsoDate(earlier)
            if (!laterDate || !earlierDate) return null

            const laterMs = dateStringToUtcMidnightMs(laterDate)
            const earlierMs = dateStringToUtcMidnightMs(earlierDate)
            if (laterMs === null || earlierMs === null) return null
            if (laterMs === earlierMs) return 0

            const direction = laterMs > earlierMs ? 1 : -1
            let cursor = earlierDate
            let count = 0

            while (cursor !== laterDate) {
                const next = addUtcDays(cursor, direction)
                if (!next) return null
                cursor = next
                if (isIncluded(cursor)) count += direction
            }

            return count
        },
    }
}

export const calendarDayBusinessCalendar: BusinessCalendar = {
    id: 'calendar-day',

    isBusinessDay(isoDate) {
        return dateStringToUtcMidnightMs(isoDate ?? null) !== null
    },

    addBusinessDays(isoDate, amount) {
        const normalized = normalizeToUtcIsoDate(isoDate)
        if (!normalized) return null
        return addDaysToIsoDate(normalized, amount)
    },

    diffInBusinessDays(later, earlier) {
        const laterMs = dateStringToUtcMidnightMs(later ?? null)
        const earlierMs = dateStringToUtcMidnightMs(earlier ?? null)
        if (laterMs === null || earlierMs === null) return null
        return Math.round((laterMs - earlierMs) / MS_PER_DAY)
    },
}

export const weekdayBusinessCalendar: BusinessCalendar = createSkippingBusinessCalendar(
    'weekday',
    isWeekendUtc,
)

export const usFederalObservedBusinessCalendar: BusinessCalendar = createSkippingBusinessCalendar(
    'us-federal-observed',
    (isoDate) => isWeekendUtc(isoDate) || isUsFederalObservedHoliday(isoDate),
)

// Calendar used by active date-kind project scheduling and urgency. The
// default calendar stays calendar-day for compatibility paths such as ICS
// all-day DTEND rendering.
export const dateProjectBusinessCalendar = usFederalObservedBusinessCalendar

export const defaultBusinessCalendar = calendarDayBusinessCalendar
