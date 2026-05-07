// Wave 35 Task 1 — ICS (RFC 5545) document rendering.
//
// Pure functions so the unit test runner can drive them directly. The Deno
// edge function imports `renderIcsDocument` from here. Date math routes
// through `supabase/functions/_shared/business-calendar.ts` (the Deno mirror
// of the app business-calendar seam) per the styleguide's no-raw-date-math rule.

import { calendarDayBusinessCalendar } from '../_shared/business-calendar.ts';

export interface IcsTaskRow {
    id: string;
    title: string | null;
    description: string | null;
    due_date: string;
    start_date: string | null;
    status: string | null;
    root_id: string | null;
}

export interface RenderIcsOptions {
    calendarName?: string;
    feedUrl?: string;
    /** Injected clock — tests pin this to keep DTSTAMP stable. */
    now?: Date;
}

/**
 * Escape a string per RFC 5545 §3.3.11 TEXT encoding:
 *   backslash → \\ ; newline → \n ; comma → \, ; semicolon → \;
 */
export function escapeIcsText(value: string | null | undefined): string {
    if (value == null) return '';
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\r\n|\r|\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

/** Folds a single content line to 75-byte chunks per RFC 5545 §3.1. */
export function foldLine(line: string): string {
    if (line.length <= 75) return line;
    const out: string[] = [];
    let i = 0;
    while (i < line.length) {
        const chunkLen = i === 0 ? 75 : 74;
        out.push((i === 0 ? '' : ' ') + line.slice(i, i + chunkLen));
        i += chunkLen;
    }
    return out.join('\r\n');
}

/** Format a Date as an RFC 5545 UTC timestamp (`YYYYMMDDTHHMMSSZ`). */
export function formatIcsUtcStamp(date: Date): string {
    const y = date.getUTCFullYear().toString().padStart(4, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = date.getUTCDate().toString().padStart(2, '0');
    const hh = date.getUTCHours().toString().padStart(2, '0');
    const mm = date.getUTCMinutes().toString().padStart(2, '0');
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

/** Format a `YYYY-MM-DD` calendar-day string as an RFC 5545 DATE (`YYYYMMDD`). */
export function formatIcsDate(dateStr: string): string {
    return dateStr.replace(/-/g, '');
}

/**
 * Render a full iCalendar document from task rows. One VEVENT per task with a
 * VALARM `-PT24H` reminder. All-day events (DATE value type on DTSTART +
 * DTEND) — easier to import cleanly across Google / Outlook / Apple Calendar.
 */
export function renderIcsDocument(tasks: IcsTaskRow[], opts: RenderIcsOptions = {}): string {
    const calendarName = opts.calendarName ?? 'PlanterPlan';
    const now = opts.now ?? new Date();
    const dtStamp = formatIcsUtcStamp(now);

    const lines: string[] = [];
    const push = (l: string) => {
        for (const folded of foldLine(l).split('\r\n')) lines.push(folded);
    };

    push('BEGIN:VCALENDAR');
    push('VERSION:2.0');
    push('PRODID:-//PlanterPlan//Wave 35 ICS Feed//EN');
    push('CALSCALE:GREGORIAN');
    push(`X-WR-CALNAME:${escapeIcsText(calendarName)}`);
    if (opts.feedUrl) push(`X-WR-SOURCE:${escapeIcsText(opts.feedUrl)}`);
    push('METHOD:PUBLISH');

    for (const task of tasks) {
        const startDate = task.start_date && /^\d{4}-\d{2}-\d{2}$/.test(task.start_date)
            ? task.start_date
            : task.due_date;
        const dueDate = task.due_date;
        if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) continue;

        const startFmt = formatIcsDate(startDate);
        // DTEND is exclusive in iCal; advance one literal calendar day so
        // single-day events render even after date-project scheduling starts
        // skipping weekends and observed holidays.
        const dueNextIso = calendarDayBusinessCalendar.addBusinessDays(dueDate, 1);
        if (!dueNextIso) continue;
        const endFmt = formatIcsDate(dueNextIso);

        push('BEGIN:VEVENT');
        push(`UID:task-${task.id}@planterplan`);
        push(`DTSTAMP:${dtStamp}`);
        push(`DTSTART;VALUE=DATE:${startFmt}`);
        push(`DTEND;VALUE=DATE:${endFmt}`);
        push(`SUMMARY:${escapeIcsText(task.title ?? '(untitled task)')}`);
        if (task.description) push(`DESCRIPTION:${escapeIcsText(task.description)}`);
        if (task.status) push(`STATUS:${mapIcsStatus(task.status)}`);

        // 24-hour advance reminder.
        push('BEGIN:VALARM');
        push('ACTION:DISPLAY');
        push(`DESCRIPTION:${escapeIcsText(task.title ?? '(untitled task)')}`);
        push('TRIGGER:-PT24H');
        push('END:VALARM');

        push('END:VEVENT');
    }

    push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
}

function mapIcsStatus(status: string): string {
    switch (status) {
        case 'completed':
            return 'COMPLETED';
        case 'blocked':
            return 'CANCELLED';
        case 'in_progress':
            return 'IN-PROCESS';
        case 'not_started':
        case 'todo':
        default:
            return 'NEEDS-ACTION';
    }
}
