import type { JsonObject, TaskFormData } from '@/shared/db/app.types';
import { applyStrategyTemplateFlag, formDataToStrategyTemplateFlag } from '@/features/tasks/lib/strategy-form';

type TaskFormOrigin = 'instance' | 'template';

export function sanitizeTemplateFlagFormData(
    data: TaskFormData,
    origin: TaskFormOrigin,
): TaskFormData {
    if (origin === 'template') return data;

    const sanitized = { ...data };
    delete sanitized.is_strategy_template;
    return sanitized;
}

export function buildTemplateFlagSettingsPatch(
    origin: TaskFormOrigin,
    data: TaskFormData,
    currentSettings: unknown,
): JsonObject | undefined {
    if (origin !== 'template') return undefined;
    return applyStrategyTemplateFlag(currentSettings, formDataToStrategyTemplateFlag(data));
}
