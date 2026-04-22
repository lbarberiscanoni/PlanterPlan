import { describe, it, expect } from 'vitest';
import {
    escapeIcsText,
    foldLine,
    formatIcsDate,
    formatIcsUtcStamp,
    renderIcsDocument,
    type IcsTaskRow,
} from '@/../supabase/functions/ics-feed/ics';

const NOW = new Date('2026-04-22T12:00:00.000Z');

describe('escapeIcsText (Wave 35)', () => {
    it('escapes backslashes, newlines, commas, and semicolons', () => {
        expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    });

    it('returns empty string for nullish inputs', () => {
        expect(escapeIcsText(null)).toBe('');
        expect(escapeIcsText(undefined)).toBe('');
    });
});

describe('foldLine', () => {
    it('passes short lines through unchanged', () => {
        expect(foldLine('SUMMARY:hello')).toBe('SUMMARY:hello');
    });

    it('folds lines longer than 75 octets with CRLF + leading space', () => {
        const long = 'X'.repeat(200);
        const folded = foldLine(long);
        expect(folded.includes('\r\n ')).toBe(true);
        const reassembled = folded.split('\r\n ').join('');
        expect(reassembled).toBe(long);
    });
});

describe('formatIcsDate / formatIcsUtcStamp', () => {
    it('strips hyphens for DATE format', () => {
        expect(formatIcsDate('2026-04-22')).toBe('20260422');
    });

    it('renders a UTC DATETIME-stamp', () => {
        expect(formatIcsUtcStamp(NOW)).toBe('20260422T120000Z');
    });
});

function buildTasks(): IcsTaskRow[] {
    return [
        {
            id: 'task-1',
            title: 'Buy a domain',
            description: 'Register planterplan.com',
            due_date: '2026-04-25',
            start_date: '2026-04-24',
            status: 'in_progress',
            root_id: 'project-1',
        },
        {
            id: 'task-2',
            title: 'Write welcome email; contains, reserved\\chars',
            description: null,
            due_date: '2026-05-10',
            start_date: null,
            status: 'completed',
            root_id: 'project-1',
        },
    ];
}

describe('renderIcsDocument', () => {
    it('produces a full VCALENDAR with required headers', () => {
        const doc = renderIcsDocument(buildTasks(), { now: NOW });
        expect(doc.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
        expect(doc.includes('VERSION:2.0\r\n')).toBe(true);
        expect(doc.includes('PRODID:-//PlanterPlan//Wave 35 ICS Feed//EN\r\n')).toBe(true);
        expect(doc.includes('METHOD:PUBLISH\r\n')).toBe(true);
        expect(doc.trim().endsWith('END:VCALENDAR')).toBe(true);
    });

    it('emits one VEVENT per task with UID, DTSTART, DTEND, SUMMARY', () => {
        const doc = renderIcsDocument(buildTasks(), { now: NOW });
        const events = doc.match(/BEGIN:VEVENT/g) ?? [];
        expect(events.length).toBe(2);
        expect(doc.includes('UID:task-task-1@planterplan')).toBe(true);
        expect(doc.includes('UID:task-task-2@planterplan')).toBe(true);
        expect(doc.includes('DTSTART;VALUE=DATE:20260424')).toBe(true);
        // Due 2026-04-25 → DTEND exclusive = 2026-04-26.
        expect(doc.includes('DTEND;VALUE=DATE:20260426')).toBe(true);
    });

    it('escapes summary special characters', () => {
        const doc = renderIcsDocument(buildTasks(), { now: NOW });
        expect(doc.includes('SUMMARY:Write welcome email\\; contains\\, reserved\\\\chars')).toBe(true);
    });

    it('emits VALARM with -PT24H trigger per event', () => {
        const doc = renderIcsDocument(buildTasks(), { now: NOW });
        const alarms = doc.match(/BEGIN:VALARM/g) ?? [];
        expect(alarms.length).toBe(2);
        expect(doc.includes('TRIGGER:-PT24H')).toBe(true);
    });

    it('maps status text to RFC STATUS values', () => {
        const doc = renderIcsDocument(buildTasks(), { now: NOW });
        expect(doc.includes('STATUS:IN-PROCESS')).toBe(true);
        expect(doc.includes('STATUS:COMPLETED')).toBe(true);
    });

    it('falls back to due_date for DTSTART when start_date is null', () => {
        const doc = renderIcsDocument(
            [
                {
                    id: 't',
                    title: 'no start',
                    description: null,
                    due_date: '2026-06-01',
                    start_date: null,
                    status: null,
                    root_id: null,
                },
            ],
            { now: NOW },
        );
        expect(doc.includes('DTSTART;VALUE=DATE:20260601')).toBe(true);
    });

    it('skips tasks with malformed due dates', () => {
        const doc = renderIcsDocument(
            [
                {
                    id: 't',
                    title: 'bad',
                    description: null,
                    due_date: 'not-a-date',
                    start_date: null,
                    status: null,
                    root_id: null,
                },
            ],
            { now: NOW },
        );
        expect(doc.includes('BEGIN:VEVENT')).toBe(false);
    });
});
