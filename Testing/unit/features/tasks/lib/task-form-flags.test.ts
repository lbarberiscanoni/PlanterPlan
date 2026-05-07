import { describe, expect, it } from 'vitest';
import {
    buildTemplateFlagSettingsPatch,
    sanitizeTemplateFlagFormData,
} from '@/features/tasks/lib/task-form-flags';
import type { TaskFormData } from '@/shared/db/app.types';

describe('task-form-flags.sanitizeTemplateFlagFormData', () => {
    it('preserves coaching and strategy fields for template forms', () => {
        const data = {
            title: 'Template task',
            is_coaching_task: true,
            is_strategy_template: true,
        } as TaskFormData;

        expect(sanitizeTemplateFlagFormData(data, 'template')).toEqual(data);
    });

    it('strips coaching and strategy fields from instance forms', () => {
        const data = {
            title: 'Project task',
            is_coaching_task: true,
            is_strategy_template: true,
        } as TaskFormData;

        expect(sanitizeTemplateFlagFormData(data, 'instance')).toEqual({
            title: 'Project task',
        });
    });
});

describe('task-form-flags.buildTemplateFlagSettingsPatch', () => {
    it('does not build a settings patch for instance payloads, even if flags are present', () => {
        const data = {
            title: 'Project task',
            is_coaching_task: false,
            is_strategy_template: true,
        } as TaskFormData;

        expect(
            buildTemplateFlagSettingsPatch(
                'instance',
                data,
                { is_coaching_task: true, is_strategy_template: true, due_soon_threshold: 3 },
            ),
        ).toBeUndefined();
    });

    it('sets template flags while preserving unrelated settings', () => {
        const data = {
            title: 'Template task',
            is_coaching_task: true,
            is_strategy_template: true,
        } as TaskFormData;

        expect(buildTemplateFlagSettingsPatch('template', data, { published: true })).toEqual({
            published: true,
            is_coaching_task: true,
            is_strategy_template: true,
        });
    });

    it('clears template flags while preserving unrelated settings', () => {
        const data = {
            title: 'Template task',
            is_coaching_task: false,
            is_strategy_template: false,
        } as TaskFormData;

        expect(
            buildTemplateFlagSettingsPatch(
                'template',
                data,
                { published: true, is_coaching_task: true, is_strategy_template: true },
            ),
        ).toEqual({ published: true });
    });
});
