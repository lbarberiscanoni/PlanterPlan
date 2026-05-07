import type { JsonObject, TaskFormData, TaskRow } from '@/shared/db/app.types';

function isJsonObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read the strategy-template flag from a task's `settings` JSONB. Tolerates
 * loose shapes: returns `false` for null / undefined / non-object settings,
 * for a missing `is_strategy_template` key, or for any non-`true` value.
 * @param task - Task-like object (possibly partial, nullable).
 * @returns `true` iff `task.settings.is_strategy_template === true`.
 */
export function extractStrategyTemplateFlag(task?: Partial<TaskRow> | null): boolean {
    const settings = task?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
    return (settings as Record<string, unknown>).is_strategy_template === true;
}

/**
 * Normalise the flat `is_strategy_template` form field emitted by TaskForm
 * into a patch for the outgoing `settings` JSONB. Mirrors
 * {@link applyStrategyTemplateFlag}'s sibling in `coaching-form.ts`.
 *
 * Return semantics:
 *   - `true`  → caller should set `settings.is_strategy_template = true`
 *   - `false` → caller should delete `settings.is_strategy_template`
 *   - `null`  → caller should leave `settings` untouched (e.g. the UI gate
 *               hid the checkbox for the current user's role, so the field
 *               never rendered and submission didn't emit a value)
 * @param data - Task form data.
 * @returns The normalised strategy intent (or `null` to leave settings alone).
 */
export function formDataToStrategyTemplateFlag(data: TaskFormData): boolean | null {
    if (data.is_strategy_template === undefined) return null;
    return Boolean(data.is_strategy_template);
}

/**
 * Apply the normalised strategy-template flag to an existing `settings` JSONB
 * object, preserving every other key. Returns `undefined` when there is
 * nothing to persist (`flag === null` AND no existing settings), so the
 * caller can skip including `settings` in the outgoing payload entirely.
 *
 * Designed to chain with {@link applyCoachingFlag} — both helpers preserve
 * the keys they don't own, so callers can apply them in sequence to build a
 * single merged settings patch.
 *
 * Companion UX (Wave 24): when this flag is true on an instance task and the
 * task's status transitions into `completed`, `StrategyFollowUpDialog` opens
 * to offer Master Library templates that will be cloned as sibling tasks.
 * @param currentSettings - Existing settings object on the task (nullable).
 * @param flag - Normalised strategy intent (see `formDataToStrategyTemplateFlag`).
 * @returns The merged settings patch, or `undefined` to skip the update.
 */
export function applyStrategyTemplateFlag(
    currentSettings: unknown,
    flag: boolean | null,
): JsonObject | undefined {
    const base =
        isJsonObject(currentSettings)
            ? { ...currentSettings }
            : {};
    if (flag === null) {
        return Object.keys(base).length > 0 ? base : undefined;
    }
    if (flag === true) {
        return { ...base, is_strategy_template: true };
    }
    const next = { ...base };
    delete next.is_strategy_template;
    return next;
}
