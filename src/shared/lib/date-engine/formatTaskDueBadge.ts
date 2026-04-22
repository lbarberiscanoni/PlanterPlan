import { diffInCalendarDays, formatDate, toIsoDate } from '@/shared/lib/date-engine/index';

export type DueBadgeTone = 'overdue' | 'due_soon' | 'neutral';
/**
 * Discriminator telling the renderer how to render the label:
 *   - `'today'` / `'tomorrow'` → look up `tasks.dueBadge.today` / `.tomorrow`
 *   - `'weekdayShort'` → use the pre-formatted short string ("Mon Apr 27")
 *   - `'fullDate'` → use the pre-formatted "MMM d, yyyy" string
 *
 * The weekday / full-date forms are locale-insensitive today (date-fns default
 * locale). A future locale-aware pass can swap them for Intl-backed tokens
 * that the renderer composes. Until then, the labels are bound in English.
 */
export type DueBadgeKind = 'today' | 'tomorrow' | 'weekdayShort' | 'fullDate';

export interface DueBadgeResult {
    /** Pre-computed display label — convenient for tests and for renderers that don't need locale translation. */
    label: string;
    kind: DueBadgeKind;
    tone: DueBadgeTone;
}

export interface FormatTaskDueBadgeArgs {
    dueDate: string | Date | null | undefined;
    now?: Date;
    /** Threshold in calendar days for "due soon" tone. Typically pulled from the root project's `settings.due_soon_threshold`; falls back to 3. */
    dueSoonThresholdDays?: number;
}

/**
 * Wave 33 — derive the due-date badge label + tone + i18n discriminator for
 * a single task. All date arithmetic routes through `@/shared/lib/date-engine`
 * (this file *lives* in `date-engine/`, so `new Date()` as a default here is
 * the centralized clock, not a styleguide violation).
 *
 * Label rules:
 *   - today → "Today"
 *   - tomorrow → "Tomorrow"
 *   - within ±7 calendar days (exclusive of the above) → weekday + short date
 *     (e.g. "Mon Apr 27")
 *   - else → "MMM d, yyyy"
 *
 * Tone rules:
 *   - overdue (due_date strictly before today) → 'overdue'
 *   - within `dueSoonThresholdDays` calendar days from today (inclusive,
 *     non-overdue) → 'due_soon'
 *   - everything else → 'neutral'
 *
 * @param args.dueDate ISO date string, Date, or null/undefined (returns null).
 * @param args.now Injected clock; defaults to `new Date()`. Pass an explicit
 *   Date in tests for deterministic output.
 * @param args.dueSoonThresholdDays Calendar-day window for the `due_soon`
 *   tone. Typically pulled from the root project's
 *   `settings.due_soon_threshold` (see `useTaskFilters`); falls back to 3.
 * @returns `{ label, kind, tone }` triple, or `null` when the input can't
 *   be rendered (null / invalid date). The `kind` discriminator drives i18n
 *   — see `TaskItem.tsx` for the translation mapping.
 */
export function formatTaskDueBadge({
    dueDate,
    now = new Date(),
    dueSoonThresholdDays = 3,
}: FormatTaskDueBadgeArgs): DueBadgeResult | null {
    if (dueDate == null) return null;

    const nowIso = toIsoDate(now);
    const dueIso = toIsoDate(dueDate);
    if (!nowIso || !dueIso) return null;

    const diff = diffInCalendarDays(dueIso, nowIso);
    if (diff == null) return null;

    let tone: DueBadgeTone;
    if (diff < 0) {
        tone = 'overdue';
    } else if (diff <= Math.max(0, Math.floor(dueSoonThresholdDays))) {
        tone = 'due_soon';
    } else {
        tone = 'neutral';
    }

    let kind: DueBadgeKind;
    let label: string;
    if (diff === 0) {
        kind = 'today';
        label = 'Today';
    } else if (diff === 1) {
        kind = 'tomorrow';
        label = 'Tomorrow';
    } else if (diff >= -7 && diff <= 7) {
        kind = 'weekdayShort';
        label = formatDate(dueDate, 'EEE MMM d');
    } else {
        kind = 'fullDate';
        label = formatDate(dueDate, 'MMM d, yyyy');
    }

    return { label, kind, tone };
}

const TONE_CLASS_MAP: Record<DueBadgeTone, string> = {
    overdue: 'text-red-600',
    due_soon: 'text-orange-600',
    neutral: 'text-slate-600',
};

/**
 * Wave 33 — resolve a `DueBadgeTone` to its Tailwind text-color utility.
 *
 * @param tone One of `'overdue' | 'due_soon' | 'neutral'`.
 * @returns The matching `text-*` utility class — stable reference.
 */
export function dueBadgeToneClass(tone: DueBadgeTone): string {
    return TONE_CLASS_MAP[tone];
}
