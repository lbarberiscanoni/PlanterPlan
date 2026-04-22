import { describe, it, expect } from 'vitest';
import { dueBadgeToneClass, formatTaskDueBadge } from '@/shared/lib/date-engine/formatTaskDueBadge';

// Injected clock: Wednesday, Apr 22 2026.
const NOW = new Date('2026-04-22T12:00:00.000Z');

describe('formatTaskDueBadge (Wave 33)', () => {
    it('returns null when dueDate is null', () => {
        expect(formatTaskDueBadge({ dueDate: null, now: NOW })).toBeNull();
    });

    it('returns null when dueDate is invalid', () => {
        expect(formatTaskDueBadge({ dueDate: 'not-a-date', now: NOW })).toBeNull();
    });

    it('labels today with kind="today" and due_soon tone', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-04-22', now: NOW });
        expect(result).toEqual({ label: 'Today', kind: 'today', tone: 'due_soon' });
    });

    it('labels tomorrow with kind="tomorrow" and due_soon tone', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-04-23', now: NOW });
        expect(result).toEqual({ label: 'Tomorrow', kind: 'tomorrow', tone: 'due_soon' });
    });

    it('labels three days out as weekday + short date with due_soon tone (default threshold = 3)', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-04-25', now: NOW });
        expect(result?.label).toMatch(/^[A-Z][a-z]{2} Apr 25$/);
        expect(result?.kind).toBe('weekdayShort');
        expect(result?.tone).toBe('due_soon');
    });

    it('labels four days out with weekday + short date, downgrades to neutral at default threshold', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-04-26', now: NOW });
        expect(result?.label).toMatch(/^[A-Z][a-z]{2} Apr 26$/);
        expect(result?.kind).toBe('weekdayShort');
        expect(result?.tone).toBe('neutral');
    });

    it('respects a custom dueSoonThresholdDays threshold', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-04-28', now: NOW, dueSoonThresholdDays: 7 });
        expect(result?.tone).toBe('due_soon');
    });

    it('labels minus-two days as weekday + short date with overdue tone', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-04-20', now: NOW });
        expect(result?.label).toMatch(/^[A-Z][a-z]{2} Apr 20$/);
        expect(result?.kind).toBe('weekdayShort');
        expect(result?.tone).toBe('overdue');
    });

    it('labels dates beyond 7 days out with full date + neutral tone', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-06-20', now: NOW });
        expect(result?.label).toBe('Jun 20, 2026');
        expect(result?.kind).toBe('fullDate');
        expect(result?.tone).toBe('neutral');
    });

    it('labels dates more than 7 days before with full date + overdue tone', () => {
        const result = formatTaskDueBadge({ dueDate: '2026-04-01', now: NOW });
        expect(result?.label).toBe('Apr 1, 2026');
        expect(result?.kind).toBe('fullDate');
        expect(result?.tone).toBe('overdue');
    });
});

describe('dueBadgeToneClass', () => {
    it('maps each tone to a Tailwind text color utility', () => {
        expect(dueBadgeToneClass('overdue')).toBe('text-red-600');
        expect(dueBadgeToneClass('due_soon')).toBe('text-orange-600');
        expect(dueBadgeToneClass('neutral')).toBe('text-slate-600');
    });
});
