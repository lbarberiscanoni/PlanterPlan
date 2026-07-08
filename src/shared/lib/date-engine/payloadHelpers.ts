import { toIsoDate, nowUtcIso } from './index';
import { POSITION_STEP } from '@/shared/constants';

// ---------------------------------------------------------------------------
// Form Data & Context Types
// ---------------------------------------------------------------------------

/** Shape of task form data as received from the UI. */
export interface TaskFormData {
 title: string;
 description?: string | null;
 notes?: string | null;
 purpose?: string | null;
 actions?: string | null;
 /** Offset in days from project start (template relative scheduling). */
 days_from_start?: string | number | null;
 /** Task length in days; leaf due = start + duration (envelope engine). */
 duration?: string | number | null;
 start_date?: string | Date | null;
 due_date?: string | Date | null;
}

/** Current task being updated (subset needed by the payload builder). */
export interface CurrentTask {
 id: string;
 start_date?: string | null;
 due_date?: string | null;
 /** Stored task length in days — hidden on instances; used to back-solve start from due. */
 duration?: number | null;
}

/** Context needed for update operations. */
export interface UpdateContext {
 origin: string;
 parentId: string | null;
 rootId?: string | null;
 contextTasks?: Array<{ id: string; parent_task_id?: string | null; start_date?: string | null; due_date?: string | null }>;
}

/** Context needed for create operations. */
export interface CreateContext extends UpdateContext {
 userId: string;
 maxPosition: number | null;
}

/** Shape of a task update payload sent to the database. */
export interface UpdatePayload {
 title: string;
 description: string | null;
 notes: string | null;
 purpose: string | null;
 actions: string | null;
 days_from_start: number | null;
 duration?: number;
 updated_at: string;
 start_date?: string | null;
 due_date?: string | null;
}

/** Shape of a task insert payload sent to the database. */
export interface InsertPayload {
 title: string;
 description: string | null;
 notes: string | null;
 purpose: string | null;
 actions: string | null;
 days_from_start: number | null;
 duration?: number;
 origin: string;
 creator: string;
 parent_task_id: string | null;
 position: number;
 is_complete: boolean;
 root_id?: string | null;
 start_date?: string | null;
 due_date?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalizes the raw `days_from_start` form value to a number or null. */
const parseDays = (value: string | number | null | undefined): number | null => {
 if (value === '' || value === null || value === undefined) return null;
 return Number(value);
};

/**
 * Subtract `days` calendar days from a `YYYY-MM-DD` string (UTC-safe).
 *
 * This mirrors the DB leaf trigger `compute_leaf_due_date`, which derives
 * `due = (start::date + duration)` in PLAIN calendar days (no weekend skipping).
 * Instances are due-authoritative, so we back-solve `start = due - duration`
 * here with the exact same arithmetic — the trigger then re-derives `due` from
 * that start and the chosen due survives the round-trip.
 */
const subtractCalendarDays = (isoDate: string, days: number): string => {
 const [y, m, d] = isoDate.split('-').map(Number);
 const dt = new Date(Date.UTC(y, m - 1, d));
 dt.setUTCDate(dt.getUTCDate() - Math.max(0, days));
 return dt.toISOString().slice(0, 10);
};

/** Calendar days between two `YYYY-MM-DD` strings (`later - earlier`, UTC-safe). */
const calendarDaysBetween = (laterIso: string, earlierIso: string): number => {
 const asUtc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
 };
 return Math.round((asUtc(laterIso) - asUtc(earlierIso)) / 86_400_000);
};

// ---------------------------------------------------------------------------
// Payload Constructors
// ---------------------------------------------------------------------------

/**
 * Constructs the payload for updating an existing task.
 * Centralizes logic for 'Instance' vs 'Template' and date inputs.
 */
export const constructUpdatePayload = (
 formData: TaskFormData,
 currentTask: CurrentTask,
 context: UpdateContext,
): UpdatePayload => {
 const { origin } = context;

 const parsedDays = parseDays(formData.days_from_start);    // offset from project start
 const parsedDuration = parseDays(formData.duration);       // task length (days)

 const payload: UpdatePayload = {
 title: formData.title,
 description: formData.description ?? null,
 notes: formData.notes ?? null,
 purpose: formData.purpose ?? null,
 actions: formData.actions ?? null,
 days_from_start: parsedDays,
 updated_at: nowUtcIso(),
 };

 // Envelope engine: `due` is derived by the DB leaf trigger (start + duration)
 // and containers roll up MIN/MAX — never compute or write due here. Only write
 // duration when the form supplied it (omit to leave the stored value intact and
 // avoid zeroing a template-seeded duration on an instance edit).
 if (parsedDuration !== null) {
 payload.duration = parsedDuration;
 }
 // Instances are DUE-authoritative: the user sets the due date and we keep the
 // task's length fixed, moving its start. The length is the task's VISIBLE span
 // (current due - current start), not the stored `duration` column — those can
 // drift (envelope-migration backfill left some columns stale), and the visible
 // gap is what the user is preserving. We write start = newDue - length AND a
 // corrected duration = length, so the DB leaf trigger (due = start + duration)
 // yields exactly the chosen due and the stale column self-heals.
 if (origin === 'instance') {
 const manualDueDate = toIsoDate(formData.due_date);
 if (manualDueDate) {
 const curStart = toIsoDate(currentTask.start_date);
 const curDue = toIsoDate(currentTask.due_date);
 const length = curStart && curDue
 ? Math.max(0, calendarDaysBetween(curDue, curStart))
 : Math.max(0, typeof currentTask.duration === 'number' ? currentTask.duration : 0);
 payload.start_date = subtractCalendarDays(manualDueDate, length);
 payload.duration = length;
 }
 }

 return payload;
};

/**
 * Constructs the payload for creating a new task.
 */
export const constructCreatePayload = (
 formData: TaskFormData,
 context: CreateContext,
): InsertPayload => {
 const { origin, parentId, rootId, userId, maxPosition } = context;

 const parsedDays = parseDays(formData.days_from_start);    // offset from project start
 const parsedDuration = parseDays(formData.duration);       // task length (days)

 const insertPayload: InsertPayload = {
 title: formData.title,
 description: formData.description ?? null,
 notes: formData.notes ?? null,
 purpose: formData.purpose ?? null,
 actions: formData.actions ?? null,
 days_from_start: parsedDays,
 origin,
 creator: userId,
 parent_task_id: parentId,
 position: (maxPosition ?? 0) + POSITION_STEP,
 is_complete: false,
 root_id: rootId,
 };

 if (parsedDuration !== null) {
 insertPayload.duration = parsedDuration;
 }
 // New instance tasks are DUE-authoritative too: derive start = due - duration
 // (duration defaults to 0 for a brand-new custom task, so start = due). The DB
 // leaf trigger re-derives due; containers roll up MIN/MAX. Tasks created without
 // a due date stay unscheduled until one is set.
 if (origin === 'instance') {
 const manualDueDate = toIsoDate(formData.due_date);
 if (manualDueDate) {
 insertPayload.start_date = subtractCalendarDays(manualDueDate, parsedDuration ?? 0);
 }
 }

 return insertPayload;
};
