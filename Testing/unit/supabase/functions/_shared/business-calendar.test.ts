import { describe, expect, it } from 'vitest';
import {
    calendarDayBusinessCalendar,
    dateProjectBusinessCalendar,
    defaultBusinessCalendar,
    usFederalObservedBusinessCalendar,
    weekdayBusinessCalendar,
    type BusinessCalendar,
} from '../../../../../supabase/functions/_shared/business-calendar';

describe('edge business-calendar abstraction', () => {
    it('exports the calendar-day implementation as the default business calendar', () => {
        expect(defaultBusinessCalendar).toBe(calendarDayBusinessCalendar);
        expect(defaultBusinessCalendar.id).toBe('calendar-day');
    });

    it('uses US federal observed holidays for edge date-kind project scheduling', () => {
        expect(dateProjectBusinessCalendar).toBe(usFederalObservedBusinessCalendar);
        expect(dateProjectBusinessCalendar.id).toBe('us-federal-observed');
    });

    it('preserves current calendar-day addition behavior', () => {
        expect(calendarDayBusinessCalendar.addBusinessDays('2026-01-02', 1)).toBe('2026-01-03');
        expect(calendarDayBusinessCalendar.addBusinessDays('2026-01-02T00:00:00.000Z', 1)).toBe('2026-01-03');
        expect(calendarDayBusinessCalendar.addBusinessDays('2026-01-02', -1)).toBe('2026-01-01');
    });

    it('treats weekends as business days until holiday/weekend rules are explicitly added', () => {
        expect(calendarDayBusinessCalendar.isBusinessDay('2026-01-03')).toBe(true);
    });

    it('calculates current business-day differences as UTC calendar-day differences', () => {
        expect(calendarDayBusinessCalendar.diffInBusinessDays('2026-01-05', '2026-01-02')).toBe(3);
        expect(calendarDayBusinessCalendar.diffInBusinessDays('2026-01-02', '2026-01-05')).toBe(-3);
    });

    it('returns null/false for invalid inputs', () => {
        expect(calendarDayBusinessCalendar.addBusinessDays(null, 1)).toBeNull();
        expect(calendarDayBusinessCalendar.diffInBusinessDays('2026-01-05', 'not-a-date')).toBeNull();
        expect(calendarDayBusinessCalendar.isBusinessDay('not-a-date')).toBe(false);
    });

    it('has a typed contract for future edge calendar implementations', () => {
        const calendar: BusinessCalendar = calendarDayBusinessCalendar;

        expect(calendar.id).toBe('calendar-day');
    });

    it('adds weekday business days without changing the default edge calendar', () => {
        expect(defaultBusinessCalendar.id).toBe('calendar-day');
        expect(weekdayBusinessCalendar.id).toBe('weekday');
        expect(weekdayBusinessCalendar.isBusinessDay('2026-01-02')).toBe(true);
        expect(weekdayBusinessCalendar.isBusinessDay('2026-01-03')).toBe(false);

        expect(weekdayBusinessCalendar.addBusinessDays('2026-01-02', 0)).toBe('2026-01-02');
        expect(weekdayBusinessCalendar.addBusinessDays('2026-01-02', 1)).toBe('2026-01-05');
        expect(weekdayBusinessCalendar.addBusinessDays('2026-01-05', -1)).toBe('2026-01-02');
        expect(weekdayBusinessCalendar.diffInBusinessDays('2026-01-05', '2026-01-02')).toBe(1);
        expect(weekdayBusinessCalendar.diffInBusinessDays('2026-01-02', '2026-01-05')).toBe(-1);
    });

    it('skips US federal observed holidays in the non-default edge calendar', () => {
        expect(usFederalObservedBusinessCalendar.id).toBe('us-federal-observed');
        expect(usFederalObservedBusinessCalendar.isBusinessDay('2026-07-03')).toBe(false);
        expect(usFederalObservedBusinessCalendar.isBusinessDay('2026-07-06')).toBe(true);
        expect(usFederalObservedBusinessCalendar.isBusinessDay('2023-01-02')).toBe(false);
        expect(usFederalObservedBusinessCalendar.isBusinessDay('2021-12-31')).toBe(false);

        expect(usFederalObservedBusinessCalendar.addBusinessDays('2026-01-16', 1)).toBe('2026-01-20');
        expect(usFederalObservedBusinessCalendar.addBusinessDays('2026-07-02', 1)).toBe('2026-07-06');
        expect(usFederalObservedBusinessCalendar.addBusinessDays('2026-12-24', 1)).toBe('2026-12-28');
        expect(usFederalObservedBusinessCalendar.addBusinessDays('2027-01-04', -1)).toBe('2026-12-31');
        expect(usFederalObservedBusinessCalendar.diffInBusinessDays('2026-01-20', '2026-01-16')).toBe(1);
        expect(usFederalObservedBusinessCalendar.diffInBusinessDays('2026-07-06', '2026-07-02')).toBe(1);
    });
});
