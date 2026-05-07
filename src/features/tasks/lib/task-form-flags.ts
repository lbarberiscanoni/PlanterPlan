import type { JsonObject, TaskFormData } from '@/shared/db/app.types';
import { applyCoachingFlag, formDataToCoachingFlag } from '@/features/tasks/lib/coaching-form';
import { applyStrategyTemplateFlag, formDataToStrategyTemplateFlag } from '@/features/tasks/lib/strategy-form';

type TaskFormOrigin = 'instance' | 'template';

/**
 * Removes template-only behavior flag fields from instance form submissions.
 * React Hook Form can retain hidden default values for unregistered controls,
 * so this guards instance create/edit submits before they reach mutation code.
 * @param data - Submitted task form data.
 * @param origin - Form origin for the row being created or edited.
 * @returns Original data for templates; a shallow copy without behavior flags for instances.
 */
export function sanitizeTemplateFlagFormData(
    data: TaskFormData,
    origin: TaskFormOrigin,
): TaskFormData {
    if (origin === 'template') return data;

    const sanitized = { ...data };
    delete sanitized.is_coaching_task;
    delete sanitized.is_strategy_template;
    return sanitized;
}

/**
 * Builds the JSON settings patch for template-editable behavior flags.
 * Instance origins intentionally return no patch, even when crafted form data
 * includes flag fields, so existing inherited instance behavior stays read-only.
 * @param origin - Form origin for the row being created or edited.
 * @param data - Submitted task form data.
 * @param currentSettings - Existing task settings to preserve while merging template flags.
 * @returns Settings patch for template-origin submits, or undefined for instance-origin submits.
 */
export function buildTemplateFlagSettingsPatch(
    origin: TaskFormOrigin,
    data: TaskFormData,
    currentSettings: unknown,
): JsonObject | undefined {
    if (origin !== 'template') return undefined;

    const afterCoaching = applyCoachingFlag(currentSettings, formDataToCoachingFlag(data));
    return applyStrategyTemplateFlag(
        afterCoaching ?? currentSettings,
        formDataToStrategyTemplateFlag(data),
    );
}
