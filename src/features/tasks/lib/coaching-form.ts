import type { JsonObject, TaskFormData, TaskRow } from '@/shared/db/app.types';

function isJsonObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read the coaching flag from a task's `settings` JSONB. Tolerates loose
 * shapes: returns `false` for null / undefined / non-object settings, for a
 * missing `is_coaching_task` key, or for any non-`true` value.
 * @param task - Task-like object (possibly partial, nullable).
 * @returns `true` iff `task.settings.is_coaching_task === true`.
 */
export function extractCoachingFlag(task?: Partial<TaskRow> | null): boolean {
    const settings = task?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
    return (settings as Record<string, unknown>).is_coaching_task === true;
}

/**
 * Normalise the flat `is_coaching_task` form field emitted by TaskForm into
 * a patch for the outgoing `settings` JSONB. Mirrors the one-place-to-merge
 * pattern from `recurrence-form.ts`.
 *
 * Return semantics:
 *   - `true`  → caller should set `settings.is_coaching_task = true`
 *   - `false` → caller should delete `settings.is_coaching_task` (clears flag)
 *   - `null`  → caller should leave `settings` untouched (e.g., the UI gate
 *               hid the checkbox for the current user's role, so the field
 *               never rendered and submission didn't emit a value)
 * @param data - Task form data.
 * @returns The normalised coaching intent (or `null` to leave settings alone).
 */
export function formDataToCoachingFlag(data: TaskFormData): boolean | null {
    if (data.is_coaching_task === undefined) return null;
    return Boolean(data.is_coaching_task);
}

/**
 * Apply the normalised coaching flag to an existing `settings` JSONB object,
 * preserving every other key. Returns `undefined` when there is nothing to
 * persist (`flag === null` AND no existing settings), so the caller can
 * skip including `settings` in the outgoing payload entirely.
 *
 * Companion DB behavior (Wave 23): the BEFORE INSERT/UPDATE trigger
 * `set_coaching_assignee` on `public.tasks` auto-assigns the row's
 * `assignee_id` to the project's sole `coach`-role member when this
 * helper persists `is_coaching_task: true` on a row the caller left
 * unassigned. See `docs/db/migrations/2026_04_17_coaching_auto_assign.sql`.
 * @param currentSettings - Existing settings object on the task (nullable).
 * @param flag - Normalised coaching intent (see `formDataToCoachingFlag`).
 * @returns The merged settings patch, or `undefined` to skip the update.
 */
export function applyCoachingFlag(
    currentSettings: unknown,
    flag: boolean | null,
): JsonObject | undefined {
    const base =
        isJsonObject(currentSettings)
            ? { ...currentSettings }
            : {};
    if (flag === null) {
        // No intent to change — only emit a patch if we already have settings.
        return Object.keys(base).length > 0 ? base : undefined;
    }
    if (flag === true) {
        return { ...base, is_coaching_task: true };
    }
    // flag === false → clear the key.
    const next = { ...base };
    delete next.is_coaching_task;
    return next;
}
