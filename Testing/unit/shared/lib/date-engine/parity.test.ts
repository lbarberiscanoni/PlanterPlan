import { describe, expect, it } from 'vitest';
import {
    addDaysToDate,
    dateStringToMonthKey,
    dateStringToUtcMidnight,
    isCheckpointProject as isAppCheckpointProject,
    toIsoDate,
    toMonthKey,
} from '@/shared/lib/date-engine';
import {
    calendarDayBusinessCalendar as appBusinessCalendar,
    dateProjectBusinessCalendar as appDateProjectBusinessCalendar,
    usFederalObservedBusinessCalendar as appUsFederalObservedBusinessCalendar,
    weekdayBusinessCalendar as appWeekdayBusinessCalendar,
} from '@/shared/lib/date-engine/business-calendar';
import {
    addDaysToIsoDate,
    dateStringToUtcMidnightMs,
    dateStringToUtcMonthKey,
    isCheckpointProject as isEdgeCheckpointProject,
    toUtcIsoDate,
    toUtcMonthKey,
} from '../../../../../supabase/functions/_shared/date';
import {
    calendarDayBusinessCalendar as edgeBusinessCalendar,
    dateProjectBusinessCalendar as edgeDateProjectBusinessCalendar,
    usFederalObservedBusinessCalendar as edgeUsFederalObservedBusinessCalendar,
    weekdayBusinessCalendar as edgeWeekdayBusinessCalendar,
} from '../../../../../supabase/functions/_shared/business-calendar';

describe('date-engine app/edge parity characterization', () => {
    it('keeps UTC month-key helpers aligned', () => {
        const date = new Date('2026-01-31T23:30:00.000Z');

        expect(toMonthKey(date)).toBe('2026-01');
        expect(toUtcMonthKey(date)).toBe(toMonthKey(date));
        expect(dateStringToMonthKey('2026-02-01T00:30:00+02:00')).toBe('2026-02');
        expect(dateStringToUtcMonthKey('2026-02-01T00:30:00+02:00')).toBe('2026-02');
    });

    it('keeps UTC date-only helpers aligned at timezone boundaries', () => {
        const date = new Date('2026-03-08T23:30:00-08:00');

        expect(toIsoDate(date)).toBe('2026-03-09');
        expect(toUtcIsoDate(date)).toBe(toIsoDate(date));
        expect(dateStringToUtcMidnight('2026-03-08T23:30:00-08:00')).toBe(Date.UTC(2026, 2, 9));
        expect(dateStringToUtcMidnightMs('2026-03-08T23:30:00-08:00')).toBe(Date.UTC(2026, 2, 9));
    });

    it('characterizes current calendar-day arithmetic before business-calendar work', () => {
        const fridayUtc = '2026-01-02T00:00:00.000Z';

        expect(toIsoDate(addDaysToDate(fridayUtc, 1))).toBe('2026-01-03');
        expect(addDaysToIsoDate('2026-01-02', 1)).toBe('2026-01-03');
    });

    it('keeps checkpoint project detection aligned', () => {
        const checkpointRoot = { parent_task_id: null, settings: { project_kind: 'checkpoint' } };
        const dateRoot = { parent_task_id: null, settings: { project_kind: 'date' } };
        const checkpointChild = { parent_task_id: 'root', settings: { project_kind: 'checkpoint' } };

        expect(isAppCheckpointProject(checkpointRoot)).toBe(true);
        expect(isEdgeCheckpointProject(checkpointRoot)).toBe(true);
        expect(isEdgeCheckpointProject(checkpointRoot)).toBe(isAppCheckpointProject(checkpointRoot));
        expect(isEdgeCheckpointProject(dateRoot)).toBe(isAppCheckpointProject(dateRoot));
        expect(isEdgeCheckpointProject(checkpointChild)).toBe(isAppCheckpointProject(checkpointChild));
    });

    it('keeps app and edge business-calendar behavior aligned for the calendar-day implementation', () => {
        const fridayUtc = '2026-01-02T00:00:00.000Z';

        expect(toIsoDate(appBusinessCalendar.addBusinessDays(fridayUtc, 1))).toBe(
            edgeBusinessCalendar.addBusinessDays(fridayUtc, 1),
        );
        expect(appBusinessCalendar.diffInBusinessDays('2026-01-05', '2026-01-02')).toBe(
            edgeBusinessCalendar.diffInBusinessDays('2026-01-05', '2026-01-02'),
        );
        expect(appBusinessCalendar.isBusinessDay('2026-01-03')).toBe(
            edgeBusinessCalendar.isBusinessDay('2026-01-03'),
        );
    });

    it('keeps app and edge behavior aligned for weekday and holiday calendars', () => {
        const cases = [
            {
                app: appWeekdayBusinessCalendar,
                edge: edgeWeekdayBusinessCalendar,
                start: '2026-01-02',
                amount: 1,
                diffLater: '2026-01-05',
                diffEarlier: '2026-01-02',
                included: '2026-01-05',
                excluded: '2026-01-03',
            },
            {
                app: appUsFederalObservedBusinessCalendar,
                edge: edgeUsFederalObservedBusinessCalendar,
                start: '2026-07-02',
                amount: 1,
                diffLater: '2026-07-06',
                diffEarlier: '2026-07-02',
                included: '2026-07-06',
                excluded: '2026-07-03',
            },
        ];

        for (const testCase of cases) {
            expect(toIsoDate(testCase.app.addBusinessDays(testCase.start, testCase.amount))).toBe(
                testCase.edge.addBusinessDays(testCase.start, testCase.amount),
            );
            expect(toIsoDate(testCase.app.addBusinessDays(testCase.diffLater, -1))).toBe(
                testCase.edge.addBusinessDays(testCase.diffLater, -1),
            );
            expect(toIsoDate(testCase.app.addBusinessDays(testCase.start, 0))).toBe(
                testCase.edge.addBusinessDays(testCase.start, 0),
            );
            expect(testCase.app.diffInBusinessDays(testCase.diffLater, testCase.diffEarlier)).toBe(
                testCase.edge.diffInBusinessDays(testCase.diffLater, testCase.diffEarlier),
            );
            expect(testCase.app.diffInBusinessDays(testCase.diffEarlier, testCase.diffLater)).toBe(
                testCase.edge.diffInBusinessDays(testCase.diffEarlier, testCase.diffLater),
            );
            expect(testCase.app.isBusinessDay(testCase.included)).toBe(
                testCase.edge.isBusinessDay(testCase.included),
            );
            expect(testCase.app.isBusinessDay(testCase.excluded)).toBe(
                testCase.edge.isBusinessDay(testCase.excluded),
            );
        }
    });

    it('keeps app and edge date-project calendar selection aligned', () => {
        expect(appDateProjectBusinessCalendar.id).toBe('us-federal-observed');
        expect(edgeDateProjectBusinessCalendar.id).toBe(appDateProjectBusinessCalendar.id);
        expect(toIsoDate(appDateProjectBusinessCalendar.addBusinessDays('2026-07-02', 1))).toBe(
            edgeDateProjectBusinessCalendar.addBusinessDays('2026-07-02', 1),
        );
        expect(appDateProjectBusinessCalendar.diffInBusinessDays('2026-07-06', '2026-07-02')).toBe(
            edgeDateProjectBusinessCalendar.diffInBusinessDays('2026-07-06', '2026-07-02'),
        );
    });
});
