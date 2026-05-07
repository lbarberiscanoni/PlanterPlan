import { dateProjectBusinessCalendar } from '../_shared/business-calendar.ts'
import { toUtcIsoDate } from '../_shared/date.ts'

/**
 * Adds threshold days to an instant while routing the calendar date through
 * the date-project business calendar and preserving the original UTC time-of-day.
 * @param nowIso - Current instant as an ISO timestamp.
 * @param thresholdDays - Number of date-project business days to add.
 * @returns Cutoff epoch milliseconds, or null if the input is invalid.
 */
export function dueSoonCutoffMs(nowIso: string, thresholdDays: number): number | null {
    const now = new Date(nowIso)
    if (Number.isNaN(now.getTime())) return null
    const cutoffDate = dateProjectBusinessCalendar.addBusinessDays(toUtcIsoDate(now), thresholdDays)
    if (!cutoffDate) return null
    const time = nowIso.split('T')[1]
    if (!time) return null
    const cutoffMs = new Date(`${cutoffDate}T${time}`).getTime()
    return Number.isNaN(cutoffMs) ? null : cutoffMs
}
