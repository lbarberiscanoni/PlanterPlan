import type { JsonObject } from '@/shared/db/app.types';

function isJsonObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reads `settings.phase_lead_user_ids` from a phase/milestone row. Tolerates
 * null/undefined settings, non-array values, and non-string elements.
 *
 * @param task - Task-like object (possibly partial/nullable).
 * @returns Deduped array of user ids designated as Phase Leads (empty when none).
 */
export function extractPhaseLeads(task: { settings?: unknown } | null | undefined): string[] {
    const settings = task?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return [];
    const raw = (settings as Record<string, unknown>).phase_lead_user_ids;
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const v of raw) {
        if (typeof v === 'string' && v.length > 0 && !out.includes(v)) out.push(v);
    }
    return out;
}

/**
 * Merges a Phase Leads array into the existing settings JSONB, preserving all
 * other keys. Dedups input. Always returns a fresh object.
 *
 * @param currentSettings - Existing settings JSONB on the task.
 * @param userIds - The desired set of Phase Leads.
 * @returns The merged settings patch.
 */
export function applyPhaseLeads(
    currentSettings: unknown,
    userIds: string[],
): JsonObject {
    const base =
        isJsonObject(currentSettings)
            ? { ...currentSettings }
            : {};
    const dedup = Array.from(new Set(userIds.filter((v) => typeof v === 'string' && v.length > 0)));
    return { ...base, phase_lead_user_ids: dedup };
}
