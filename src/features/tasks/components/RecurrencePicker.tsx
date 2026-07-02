import { useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import type { TaskFormData, Project } from '@/shared/db/app.types';
import { Label } from '@/shared/ui/label';
import { projectsView } from '@/shared/api/planterClient';

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
];

// Capped at 28 to avoid Feb/leap-year edge cases.
const DAY_OPTIONS: number[] = Array.from({ length: 28 }, (_, i) => i + 1);

const selectClass =
    'flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Template-only picker for `settings.recurrence`. Exposes three coordinated
 * fields (kind + weekday|day-of-month + targetProjectId). TaskList's submit
 * wrapper normalises these into the nested JSONB shape before persisting.
 */
const RecurrencePicker = () => {
    const { register, formState: { errors } } = useFormContext<TaskFormData>();
    const kind = useWatch<TaskFormData>({ name: 'recurrence_kind' }) as TaskFormData['recurrence_kind'];
    const hasRule = kind === 'weekly' || kind === 'monthly';

    const { data: projects = [], isLoading } = useQuery<Project[]>({
        queryKey: ['projects'],
        // Logical-split seam (== the old Project.list(): instance roots, newest first)
        queryFn: () => projectsView.list({ origin: 'instance' }),
    });

    return (
        <div className="my-6 border-t border-slate-200 pt-4">
            <h4 className="mb-4 text-sm font-medium text-slate-700">Recurrence (Template Auto-Spawn)</h4>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="recurrence_kind">Repeat</Label>
                    <select
                        id="recurrence_kind"
                        className={selectClass}
                        {...register('recurrence_kind')}
                    >
                        <option value="none">None</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                    </select>
                </div>

                {kind === 'weekly' && (
                    <div className="space-y-2">
                        <Label htmlFor="recurrence_weekday">On</Label>
                        <select
                            id="recurrence_weekday"
                            className={selectClass}
                            {...register('recurrence_weekday', { valueAsNumber: true })}
                        >
                            {WEEKDAY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                {kind === 'monthly' && (
                    <div className="space-y-2">
                        <Label htmlFor="recurrence_day_of_month">Day of month</Label>
                        <select
                            id="recurrence_day_of_month"
                            className={selectClass}
                            {...register('recurrence_day_of_month', { valueAsNumber: true })}
                        >
                            {DAY_OPTIONS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-500">Capped at 28 to avoid February edge cases.</p>
                    </div>
                )}
            </div>

            {hasRule && (
                <div className="mt-4 space-y-2">
                    <Label htmlFor="recurrence_target_project_id">Clone into project</Label>
                    <select
                        id="recurrence_target_project_id"
                        className={selectClass}
                        disabled={isLoading}
                        {...register('recurrence_target_project_id')}
                    >
                        <option value="">{isLoading ? 'Loading…' : 'Select a project…'}</option>
                        {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                    </select>
                    {errors.recurrence_target_project_id && (
                        <span className="text-sm text-red-500">{errors.recurrence_target_project_id.message}</span>
                    )}
                    <p className="text-xs text-slate-500">
                        When the rule fires, nightly-sync clones this template into the selected project&apos;s task tree.
                    </p>
                </div>
            )}
        </div>
    );
};

export default RecurrencePicker;
