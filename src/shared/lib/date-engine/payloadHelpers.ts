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

// ---------------------------------------------------------------------------
// Payload Constructors
// ---------------------------------------------------------------------------

/**
 * Constructs the payload for updating an existing task.
 * Centralizes logic for 'Instance' vs 'Template' and date inputs.
 */
export const constructUpdatePayload = (
 formData: TaskFormData,
 _currentTask: CurrentTask,
 context: UpdateContext,
): UpdatePayload => {
 const { origin } = context;

 const parsedDays = parseDays(formData.days_from_start);    // offset from project start
 const parsedDuration = parseDays(formData.duration);       // task length (days)
 const manualStartDate = toIsoDate(formData.start_date);

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
 // Instances carry absolute dates; start is user-authoritative (manual / drag).
 if (origin === 'instance' && manualStartDate) {
 payload.start_date = manualStartDate;
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
 const manualStartDate = toIsoDate(formData.start_date);

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
 // Instances anchor on an absolute start; `due` is derived by the DB leaf
 // trigger and containers roll up MIN/MAX. New tasks without a start stay
 // unscheduled until one is set (or seeded by clone).
 if (origin === 'instance' && manualStartDate) {
 insertPayload.start_date = manualStartDate;
 }

 return insertPayload;
};
