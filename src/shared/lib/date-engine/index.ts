import {
 format,
 addDays,
 parseISO,
 isValid,
 isPast,
 isToday,
 endOfDay,
 isBefore,
 differenceInCalendarDays
} from 'date-fns';

/**
 * Date Engine - Single Source of Truth for PlanterPlan Date Logic
 */

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

/** Flexible date input accepted by all date-engine helpers. */
export type DateInput = string | Date;

/** Minimal shape of a task needed by date-engine functions. */
export interface DateEngineTask {
 id: string;
 parent_task_id?: string | null;
 start_date?: string | null;
 due_date?: string | null;
 is_complete?: boolean | null;
 status?: string | null;
}

/** Derived urgency label used by task-list filters and reports. */
export type TaskUrgency = 'not_yet_due' | 'current' | 'due_soon' | 'overdue';

/** Return shape for schedule calculation. */
export interface ScheduleDates {
 start_date?: string;
 due_date?: string;
}

/** Return shape for min/max date calculation. */
export interface MinMaxDates {
 start_date: string | null;
 due_date: string | null;
}

/** Return shape for project date recalculation. */
export interface DateUpdateRecord {
 id: string;
 start_date: string;
 due_date: string | null;
 updated_at: string;
}

// ---------------------------------------------------------------------------
// Wrapper Functions (New — centralize date-fns access)
// ---------------------------------------------------------------------------

/** Returns the current UTC time as an ISO string. */
export const nowUtcIso = (): string => new Date().toISOString();

/**
 * Returns the current time as a `Date`. Centralized so consumers don't hand-roll
 * `new Date()` at call sites (which would bypass date-engine and make it harder
 * to override for testing / time-travel).
 */
export const getNow = (): Date => new Date();

/**
 * Safely resolves a {@link DateInput} to a `Date` object using `parseISO`
 * for strings. Returns `null` if the input is falsy or invalid.
 */
const resolve = (input: DateInput | null | undefined): Date | null => {
 if (!input) return null;
 const d = typeof input === 'string' ? parseISO(input) : input;
 return isValid(d) ? d : null;
};

/** Formats a date using the given `date-fns` format string. */
export const formatDate = (date: DateInput | null | undefined, formatStr: string): string => {
 const d = resolve(date);
 if (!d) return '';
 return format(d, formatStr);
};

/** Returns `true` if the date is strictly in the past (not today).
 *
 * Date-only strings (`YYYY-MM-DD`) are compared as UTC calendar days to match
 * the same-day convention used by {@link isTodayDate} / {@link toIsoDate} and
 * to avoid local-TZ drift near midnight boundaries. Datetime / `Date` inputs
 * still use `date-fns` `isPast` + {@link isTodayDate} (which itself promotes
 * date-only strings to the UTC branch) so the "today" carve-out remains
 * UTC-stable on every input shape.
 */
export const isPastDate = (date: DateInput | null | undefined): boolean => {
 if (date == null) return false;
 if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
  return date < new Date().toISOString().split('T')[0];
 }
 const d = resolve(date);
 if (!d) return false;
 return isPast(d) && !isTodayDate(d);
};

/** Returns `true` if the date is today.
 *
 * Date-only strings (`YYYY-MM-DD`) are compared as UTC calendar days to
 * match the codebase convention used by `toIsoDate` / `formatDisplayDate`
 * and to remain stable regardless of the runner's TZ offset.
 */
export const isTodayDate = (date: DateInput | null | undefined): boolean => {
 if (date == null) return false;
 if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
 return date === new Date().toISOString().split('T')[0];
 }
 const d = resolve(date);
 if (!d) return false;
 return isToday(d);
};

/** Adds `amount` calendar days to a date. Returns `null` on invalid input. */
export const addDaysToDate = (date: DateInput | null | undefined, amount: number): Date | null => {
 const d = resolve(date);
 if (!d) return null;
 return addDays(d, amount);
};

/** Validates a date input. */
export const isDateValid = (date: DateInput | null | undefined): boolean => {
 return resolve(date) !== null;
};

/**
 * Calendar-day difference `later - earlier` (DST-aware via date-fns).
 * Returns `null` if either input is invalid.
 */
export const diffInCalendarDays = (
 later: DateInput | null | undefined,
 earlier: DateInput | null | undefined,
): number | null => {
 const a = resolve(later);
 const b = resolve(earlier);
 if (!a || !b) return null;
 return differenceInCalendarDays(a, b);
};

/** Returns the end of the day for a given date. */
export const endOfDayDate = (date: DateInput | null | undefined): Date | null => {
 const d = resolve(date);
 if (!d) return null;
 return endOfDay(d);
};

/** Returns true if dateLeft is strictly before dateRight. */
export const isBeforeDate = (
 dateLeft: DateInput | null | undefined,
 dateRight: DateInput | null | undefined
): boolean => {
 const dl = resolve(dateLeft);
 const dr = resolve(dateRight);
 if (!dl || !dr) return false;
 return isBefore(dl, dr);
};

/** Compares two dates ascending (for sorting). Nulls map to 0 or end of list depending on logic, but we push nulls to end. */
export const compareDateAsc = (
 dateLeft: DateInput | null | undefined,
 dateRight: DateInput | null | undefined
): number => {
 const dl = resolve(dateLeft);
 const dr = resolve(dateRight);
 if (!dl && !dr) return 0;
 if (!dl) return 1; // nulls last
 if (!dr) return -1;
 return dl.getTime() - dr.getTime();
};

/** Compares two dates descending (for sorting). */
export const compareDateDesc = (
 dateLeft: DateInput | null | undefined,
 dateRight: DateInput | null | undefined
): number => {
 const dl = resolve(dateLeft);
 const dr = resolve(dateRight);
 if (!dl && !dr) return 0;
 if (!dl) return 1; // nulls last
 if (!dr) return -1;
 return dr.getTime() - dl.getTime(); // reverse of asc
};

// ---------------------------------------------------------------------------
// Core Domain Functions (existing logic, now typed)
// ---------------------------------------------------------------------------

/** Find a task by ID in a flat list. */
export const findTaskById = <T extends DateEngineTask>(
 tasks: T[],
 id: string | null | undefined,
): T | null => {
 if (id === null || id === undefined) return null;
 return tasks.find((task) => task.id === id) ?? null;
};

/**
 * Calculates start/due dates based on a parent's date and an offset.
 * Traverses ancestors to find the root project start date.
 */
export const calculateScheduleFromOffset = (
 tasks: DateEngineTask[],
 parentId: string | null | undefined,
 daysOffset: number | null | undefined,
): ScheduleDates => {
 if (parentId === null || parentId === undefined) return {};
 if (daysOffset === null || daysOffset === undefined) return {};

 const parentTask = findTaskById(tasks, parentId);
 if (!parentTask) return {};

 // Traverse up to find the root task (Project Root)
 let rootTask = parentTask;
 const visited = new Set<string>();

 while (rootTask?.parent_task_id && !visited.has(rootTask.parent_task_id)) {
 visited.add(rootTask.parent_task_id);
 const ancestor = findTaskById(tasks, rootTask.parent_task_id);
 if (!ancestor) break;
 rootTask = ancestor;
 }

 // Use root's start date (Launch Date) or parent's start date as fallback
 const projectStartDate = rootTask?.start_date || parentTask.start_date;
 if (!projectStartDate) return {};

 const baseDate = projectStartDate.includes('T')
 ? projectStartDate
 : `${projectStartDate}T00:00:00.000Z`;

 const start = new Date(baseDate);

 if (Number.isNaN(start.getTime())) return {};

 // Normalize to UTC Midnight
 start.setUTCHours(0, 0, 0, 0);
 start.setUTCDate(start.getUTCDate() + daysOffset);

 const iso = start.toISOString();
 const dateOnly = iso.split('T')[0];

 return {
 start_date: dateOnly,
 due_date: dateOnly,
 };
};

// ---------------------------------------------------------------------------
// Wave-follow-up helpers — consumed by useProjectReports + Reports.tsx so
// both go through the centralized date-engine rather than hand-rolling
// UTC-midnight / month-key math. Kept here alongside the other toIso /
// format helpers because they share the same parsing semantics.
// ---------------------------------------------------------------------------

/**
 * Returns the `YYYY-MM` prefix of a Date, built from its UTC year + month.
 *
 * @param d Source Date. Must be a real Date object (undefined/null input
 *   returns null from the sibling `dateStringToMonthKey`).
 * @returns `YYYY-MM` string built from the UTC year + month.
 */
export const toMonthKey = (d: Date): string => {
 const year = d.getUTCFullYear();
 const month = String(d.getUTCMonth() + 1).padStart(2, '0');
 return `${year}-${month}`;
};

/**
 * Accept `YYYY-MM-DD` or a full ISO timestamp; return the `YYYY-MM` prefix.
 * Null / undefined / invalid inputs return `null`.
 *
 * @param raw ISO date string (optional).
 * @returns `YYYY-MM` string or `null`.
 */
export const dateStringToMonthKey = (raw: string | null | undefined): string | null => {
 if (!raw) return null;
 if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
 const d = new Date(raw);
 if (Number.isNaN(d.getTime())) return null;
 return toMonthKey(d);
};

/**
 * Parse an ISO date string and return the UTC-midnight epoch milliseconds
 * of that calendar day. `YYYY-MM-DD` inputs are treated as UTC-midnight
 * of that day; full timestamps are truncated to UTC-midnight of their
 * calendar day. Null / invalid inputs return `null`.
 *
 * Uses `Date.UTC` for the explicit UTC epoch (no mutating setters).
 *
 * @param raw ISO date string.
 * @returns Epoch milliseconds at UTC-midnight, or `null`.
 */
export const dateStringToUtcMidnight = (raw: string | null | undefined): number | null => {
 if (!raw) return null;
 const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
 const d = new Date(iso);
 if (Number.isNaN(d.getTime())) return null;
 return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * Converts a date input to a `YYYY-MM-DD` string, ensuring UTC handling.
 */
export const toIsoDate = (value: DateInput | null | undefined): string | null => {
 if (!value) return null;

 // Handle Date objects directly
 if (value instanceof Date) {
 return value.toISOString().split('T')[0];
 }

 // Handle strings
 if (typeof value === 'string') {
 // If it's already YYYY-MM-DD, return it
 if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

 const base = value.includes('T') ? value : `${value}T00:00:00.000Z`;
 const parsed = new Date(base);
 if (Number.isNaN(parsed.getTime())) return null;

 parsed.setUTCHours(0, 0, 0, 0);
 return parsed.toISOString().split('T')[0];
 }

 return null;
};

/**
 * Formats a date string for display.
 * Handles ISO timestamps (Local Time) AND YYYY-MM-DD (UTC).
 */
export const formatDisplayDate = (dateStr: string | null | undefined): string => {
 if (!dateStr) return 'Not set';

 let date: Date;
 // If it contains a 'T', it's an ISO timestamp (e.g. created_at) -> Parse as Local
 // If it's short (YYYY-MM-DD), it's a manual date -> Parse as UTC to prevent "yesterday" bugs
 if (dateStr.includes('T')) {
 date = new Date(dateStr);
 } else {
 const [yearStr, monthStr, dayStr] = dateStr.split('-');
 date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr)));
 }

 if (isNaN(date.getTime())) return 'Invalid Date';

 return date.toLocaleDateString('en-US', {
 weekday: 'short',
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 timeZone: dateStr.includes('T') ? undefined : 'UTC',
 });
};

/**
 * Calculates the bounding box (Min Start, Max Due) for a list of tasks.
 * Used for bottom-up date inheritance.
 */
export const calculateMinMaxDates = (children: DateEngineTask[] | null | undefined): MinMaxDates => {
 if (!children || children.length === 0) {
 return { start_date: null, due_date: null };
 }

 let minStart: string | null = null;
 let maxDue: string | null = null;

 children.forEach((child) => {
 // Handle Start Date
 if (child.start_date) {
 const childStart = toIsoDate(child.start_date);
 if (childStart) {
 if (!minStart || childStart < minStart) {
 minStart = childStart;
 }
 }
 }

 // Handle Due Date
 if (child.due_date) {
 const childDue = toIsoDate(child.due_date);
 if (childDue) {
 if (!maxDue || childDue > maxDue) {
 maxDue = childDue;
 }
 }
 }
 });

 return {
 start_date: minStart,
 due_date: maxDue,
 };
};

/**
 * Recalculates start/due dates for a project's tasks when the project start date changes.
 * Only affects incomplete tasks.
 */
export const recalculateProjectDates = (
 projectTasks: DateEngineTask[] | null | undefined,
 newStartDateStr: string | null | undefined,
 oldStartDateStr: string | null | undefined,
): DateUpdateRecord[] => {
 if (!projectTasks || !newStartDateStr || !oldStartDateStr) return [];

 // Wave 29: checkpoint projects don't bulk-shift on start-date changes.
 const root = projectTasks.find((t) => !t.parent_task_id);
 if (isCheckpointProject(root)) return [];

 const oldIso = toIsoDate(oldStartDateStr);
 const newIso = toIsoDate(newStartDateStr);
 if (!oldIso || !newIso) return [];

 const oldStart = new Date(oldIso);
 const newStart = new Date(newIso);

 if (isNaN(oldStart.getTime()) || isNaN(newStart.getTime())) return [];

 // Calculate delta in milliseconds
 const diffTime = newStart.getTime() - oldStart.getTime();
 const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

 if (diffDays === 0) return [];

 const updates: DateUpdateRecord[] = [];

 projectTasks.forEach((task) => {
 // Skip if task is completed by either signal (preserve history)
 if (task.is_complete || task.status === 'completed') return;

 // Skip if task has no dates
 if (!task.start_date) return;

 const taskStartIso = toIsoDate(task.start_date);
 if (!taskStartIso) return;

 const taskStart = new Date(taskStartIso);
 if (isNaN(taskStart.getTime())) return;

 // Shift Start Date
 taskStart.setUTCDate(taskStart.getUTCDate() + diffDays);
 const newStartISO = taskStart.toISOString();

 // Shift Due Date (if exists)
 let newDueISO: string | null = null;
 if (task.due_date) {
 const taskDueIso = toIsoDate(task.due_date);
 if (taskDueIso) {
 const taskDue = new Date(taskDueIso);
 if (!isNaN(taskDue.getTime())) {
 taskDue.setUTCDate(taskDue.getUTCDate() + diffDays);
 newDueISO = taskDue.toISOString();
 }
 }
 }

 updates.push({
 id: task.id,
 start_date: newStartISO,
 due_date: newDueISO || null,
 updated_at: nowUtcIso(),
 });
 });

 return updates;
};

// ---------------------------------------------------------------------------
// Urgency Derivation (Wave 20)
// ---------------------------------------------------------------------------

const startOfUtcDay = (d: Date): Date => {
 const copy = new Date(d.getTime());
 copy.setUTCHours(0, 0, 0, 0);
 return copy;
};

/**
 * Derives an urgency label from a task's dates. Returns `null` when the task
 * has no due_date (no meaningful urgency) or is already complete.
 *
 * Branches (evaluated against UTC day boundaries):
 *  - `overdue`     — due_date strictly before today
 *  - `due_soon`    — due_date between today and today + thresholdDays (inclusive)
 *  - `not_yet_due` — start_date strictly after today
 *  - `current`     — otherwise (active and not imminent)
 */
export const deriveUrgency = (
 task: Pick<DateEngineTask, 'start_date' | 'due_date' | 'is_complete' | 'status'>,
 dueSoonThresholdDays: number,
 now: Date = new Date(),
): TaskUrgency | null => {
 if (task.is_complete || task.status === 'completed') return null;
 if (!task.due_date) return null;

 const dueIso = toIsoDate(task.due_date);
 if (!dueIso) return null;
 const due = startOfUtcDay(new Date(`${dueIso}T00:00:00.000Z`));
 if (isNaN(due.getTime())) return null;

 const today = startOfUtcDay(now);

 if (due.getTime() < today.getTime()) return 'overdue';

 const threshold = Math.max(0, Math.floor(dueSoonThresholdDays));
 const soonCutoff = startOfUtcDay(addDays(today, threshold));
 if (due.getTime() <= soonCutoff.getTime()) return 'due_soon';

 if (task.start_date) {
  const startIso = toIsoDate(task.start_date);
  if (startIso) {
   const start = startOfUtcDay(new Date(`${startIso}T00:00:00.000Z`));
   if (!isNaN(start.getTime()) && start.getTime() > today.getTime()) return 'not_yet_due';
  }
 }

 return 'current';
};

// ---------------------------------------------------------------------------
// Wave 29 — Checkpoint project kind (project-type discriminator)
// ---------------------------------------------------------------------------

/**
 * Minimal shape used by `isCheckpointProject`. Accepts any task-like object
 * with an optional settings JSONB; the only keys read are `parent_task_id`
 * and `settings.project_kind`.
 */
export interface CheckpointRootLike {
 parent_task_id?: string | null;
 settings?: Record<string, unknown> | null;
}

/**
 * True when a task's settings indicate a checkpoint-kind project. Safe on
 * non-root tasks (always false because only the root carries the kind) and
 * on null / undefined. Defaults to date-driven when the settings key is absent,
 * so every pre-Wave-29 project is unaffected.
 *
 * MUST stay byte-equivalent with the Deno mirror at
 * `supabase/functions/_shared/date.ts`. Lock-step convention per Wave 21
 * recurrence helpers.
 *
 * @param rootTask - A task-like object (or null) to inspect. Only `parent_task_id` and `settings.project_kind` are read.
 * @returns `true` iff the input is a root task with `settings.project_kind === 'checkpoint'`.
 */
export function isCheckpointProject(rootTask: CheckpointRootLike | null | undefined): boolean {
 if (!rootTask) return false;
 if (rootTask.parent_task_id) return false;
 const settings = rootTask.settings;
 if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
 return (settings as Record<string, unknown>).project_kind === 'checkpoint';
}

/**
 * Wrapper around `deriveUrgency` that accepts the task's project root and
 * short-circuits to `'not_yet_due'` for any non-completed task in a
 * checkpoint project. Date-kind projects (the default) fall through to the
 * existing branch logic unchanged — so this wrapper is signature-compatible
 * with `deriveUrgency` plus one extra optional positional argument.
 *
 * @param task - Task whose urgency is being derived (same shape as `deriveUrgency`).
 * @param rootTask - The project root (or null). When checkpoint, urgency is suppressed.
 * @param dueSoonThresholdDays - Threshold for the `due_soon` branch.
 * @param now - Injected `now` for testability.
 * @returns Urgency label, or `null` when suppressed by completion / missing dates.
 */
export const deriveUrgencyForProject = (
 task: Pick<DateEngineTask, 'start_date' | 'due_date' | 'is_complete' | 'status'>,
 rootTask: CheckpointRootLike | null | undefined,
 dueSoonThresholdDays: number,
 now: Date = new Date(),
): TaskUrgency | null => {
 if (task.is_complete || task.status === 'completed') return null;
 if (isCheckpointProject(rootTask)) return 'not_yet_due';
 return deriveUrgency(task, dueSoonThresholdDays, now);
};
