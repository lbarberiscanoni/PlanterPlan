
import { useEffect, useRef, useState, useCallback } from 'react';
import { useForm, FormProvider, type SubmitHandler } from 'react-hook-form';
import { isDateValid, isBeforeDate } from '@/shared/lib/date-engine';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import TaskFormFields from '@/features/tasks/components/TaskFormFields';
import RecurrencePicker from '@/features/tasks/components/RecurrencePicker';
import { Button } from '@/shared/ui/button';
import { isRecurrenceRule } from '@/shared/lib/recurrence';
import { extractCoachingFlag } from '@/features/tasks/lib/coaching-form';
import { extractStrategyTemplateFlag } from '@/features/tasks/lib/strategy-form';
import { sanitizeTemplateFlagFormData } from '@/features/tasks/lib/task-form-flags';
import { extractPhaseLeads } from '@/shared/lib/phase-lead';
import type { TaskFormData, TaskRow, TeamMemberWithProfile } from '@/shared/db/app.types';

const extractDateInput = (value?: string | null) => {
 if (!value) return '';
 return value.slice(0, 10);
};

const getTaskSchema = (origin: 'instance' | 'template') => z.object({
 title: z.string().min(1, 'Task title is required'),
 description: z.string().optional().nullable(),
 notes: z.string().optional().nullable(),
 purpose: z.string().optional().nullable(),
 actions: z.string().optional().nullable(),
 days_from_start: z.preprocess((val) => {
 if (val === '' || val === null || val === undefined) return undefined;
 const num = typeof val === 'number' ? val : Number(val);
 return isNaN(num) ? undefined : num;
 }, z.number().min(0, 'Days from start must be zero or greater').optional()),
 start_date: z.string().optional().nullable(),
 due_date: z.string().optional().nullable(),
 templateId: z.string().nullable().optional(),
 recurrence_kind: z.enum(['none', 'weekly', 'monthly']).optional(),
 recurrence_weekday: z.preprocess((val) => {
 if (val === '' || val === null || val === undefined) return undefined;
 const num = typeof val === 'number' ? val : Number(val);
 return isNaN(num) ? undefined : num;
 }, z.number().min(0).max(6).optional()),
 recurrence_day_of_month: z.preprocess((val) => {
 if (val === '' || val === null || val === undefined) return undefined;
 const num = typeof val === 'number' ? val : Number(val);
 return isNaN(num) ? undefined : num;
 }, z.number().min(1).max(28).optional()),
 recurrence_target_project_id: z.string().optional().nullable(),
 is_coaching_task: z.boolean().optional(),
 is_strategy_template: z.boolean().optional(),
}).refine((data) => {
 if (origin === 'instance' && data.start_date && data.due_date) {
 const start = `${data.start_date}T00:00:00.000Z`;
 const due = `${data.due_date}T00:00:00.000Z`;
 if (isDateValid(start) && isDateValid(due) && isBeforeDate(due, start)) {
 return false;
 }
 }
 return true;
}, {
 message: 'Due date cannot be before start date',
 path: ['due_date']
}).refine((data) => {
 // Template recurrence rules must specify a target project.
 if (origin === 'template' && (data.recurrence_kind === 'weekly' || data.recurrence_kind === 'monthly')) {
 return Boolean(data.recurrence_target_project_id);
 }
 return true;
}, {
 message: 'Select a project for the recurrence to clone into',
 path: ['recurrence_target_project_id'],
});

const extractRecurrence = (task?: Partial<TaskRow> | null) => {
 const settings = task?.settings;
 if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
 const rec = (settings as Record<string, unknown>).recurrence;
 return isRecurrenceRule(rec) ? rec : null;
};

const createInitialState = (task?: Partial<TaskRow> | null) => {
 const rec = extractRecurrence(task);
 return {
 title: task?.title ?? '',
 description: task?.description ?? '',
 notes: task?.notes ?? '',
 purpose: task?.purpose ?? '',
 actions: task?.actions ?? '',
 days_from_start:
 task?.days_from_start !== null && task?.days_from_start !== undefined
 ? Number(task.days_from_start)
 : undefined,
 start_date: extractDateInput(task?.start_date),
 due_date: extractDateInput(task?.due_date),
 templateId: null,
 recurrence_kind: (rec?.kind ?? 'none') as 'none' | 'weekly' | 'monthly',
 recurrence_weekday: rec?.kind === 'weekly' ? rec.weekday : 1,
 recurrence_day_of_month: rec?.kind === 'monthly' ? rec.dayOfMonth : 1,
 recurrence_target_project_id: rec?.targetProjectId ?? '',
 is_coaching_task: extractCoachingFlag(task),
 is_strategy_template: extractStrategyTemplateFlag(task),
 phase_lead_user_ids: extractPhaseLeads(task),
 };
};

export interface TaskFormProps {
 onSubmit: (data: TaskFormData) => Promise<void>;
 onCancel: () => void;
 parentTask?: { title: string } | null;
 initialTask?: Partial<TaskRow> | null;
 origin?: 'instance' | 'template';
 submitLabel?: string;
 renderLibrarySearch?: (onSelect: (task: Partial<TaskRow>) => void) => React.ReactNode;
 /** Forwarded to TaskFormFields to gate permission-scoped controls. */
 membershipRole?: string;
 /** Wave 29: project root id threaded to TaskFormFields for the Phase Lead picker. */
 projectId?: string | null;
 /** Team members supplied by the page/composition layer for phase-lead controls. */
 teamMembers?: TeamMemberWithProfile[];
}

const TaskForm = ({
 onSubmit,
 onCancel,
 parentTask,
 initialTask = null,
 origin = 'instance',
 submitLabel = 'Add New Task',
 renderLibrarySearch,
 membershipRole,
 projectId,
 teamMembers = [],
}: TaskFormProps) => {
 const isEditMode = Boolean(initialTask);
 const [lastAppliedTaskTitle, setLastAppliedTaskTitle] = useState('');
 const prevInitialTaskRef = useRef(initialTask);

 const methods = useForm<TaskFormData, unknown, TaskFormData>({
 // @ts-expect-error Zod refinement output doesn't structurally match TaskFormData for resolver
 resolver: zodResolver(getTaskSchema(origin)),
 defaultValues: createInitialState(initialTask) as TaskFormData,
 });

 const { reset, setValue, formState: { isSubmitting } } = methods;

 useEffect(() => {
 reset(createInitialState(initialTask));
 }, [initialTask, reset]);

 // Reset applied title when initialTask changes using ref comparison
 if (prevInitialTaskRef.current !== initialTask) {
 prevInitialTaskRef.current = initialTask;
 if (lastAppliedTaskTitle !== '') {
 setLastAppliedTaskTitle('');
 }
 }

 const handleApplyFromLibrary = useCallback((task: Partial<TaskRow>) => {
 if (!task) return;
 setValue('title', task.title || '', { shouldValidate: true });
 setValue('description', task.description || '', { shouldValidate: true });
 setValue('purpose', task.purpose || '', { shouldValidate: true });
 setValue('actions', task.actions || '', { shouldValidate: true });
 setValue('notes', task.notes || '', { shouldValidate: true });
 if (task.days_from_start !== null && task.days_from_start !== undefined) {
 setValue('days_from_start', Number(task.days_from_start), { shouldValidate: true });
 }
 setLastAppliedTaskTitle(task.title || '');
 }, [setValue]);

 const handleFormSubmit = useCallback<SubmitHandler<TaskFormData>>(async (data) => {
 try {
 await onSubmit(sanitizeTemplateFlagFormData(data, origin));
 if (!isEditMode) {
 reset(createInitialState(null));
 setLastAppliedTaskTitle('');
 }
 } catch (e) {
 console.error("Task submission failed:", e);
 }
 }, [onSubmit, origin, isEditMode, reset]);

 return (
 <FormProvider {...methods}>
 <form data-testid="task-form" onSubmit={methods.handleSubmit(handleFormSubmit)} className="project-form">
 <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
 {origin === 'template'
 ? (isEditMode ? 'Editing Template Task' : (submitLabel?.includes('Phase') ? 'Template Phase' : 'Template Task'))
 : (isEditMode ? 'Editing Project Task' : (submitLabel?.includes('Phase') ? 'Project Phase' : 'Project Task'))}
 </div>

 {!isEditMode && renderLibrarySearch && (
 <>
 <div className="form-group mb-4">
 {renderLibrarySearch(handleApplyFromLibrary)}
 </div>

 {lastAppliedTaskTitle && (
 <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
 Copied details from <span className="font-semibold">{lastAppliedTaskTitle}</span>.
 </div>
 )}
 </>
 )}

 {parentTask && (
 <div className="mb-4 flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
 <span className="font-semibold text-slate-500">{isEditMode ? 'Parent Task:' : 'Adding to:'}</span>
 <span className="font-medium">{parentTask.title}</span>
 </div>
 )}

 <TaskFormFields
 origin={origin}
 itemLabel={submitLabel?.includes('Phase') ? 'Phase' : 'Task'}
 membershipRole={membershipRole}
 taskType={initialTask?.task_type ?? null}
 projectId={projectId ?? initialTask?.root_id ?? null}
 teamMembers={teamMembers}
 />

 {origin === 'template' && <RecurrencePicker />}

 <div className="form-actions mt-6 flex justify-end space-x-3 border-t border-slate-100 pt-4">
 <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
 Cancel
 </Button>
 <Button type="submit" disabled={isSubmitting} className="bg-brand-500 hover:bg-brand-600 text-white">
 {isSubmitting ? 'Saving...' : (isEditMode ? 'Save Changes' : submitLabel)}
 </Button>
 </div>
 </form>
 </FormProvider>
 );
};

export default TaskForm;
