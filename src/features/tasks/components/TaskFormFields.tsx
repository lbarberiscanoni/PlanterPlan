import { useFormContext } from 'react-hook-form';
import type { ReactNode } from 'react';
import type { TaskFormData, TeamMemberWithProfile } from '@/shared/db/app.types';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { useAuth } from '@/shared/contexts/auth-context';
import { canEditTemplates } from '@/features/tasks/lib/task-permissions';

interface TaskFormFieldsProps {
 origin?: 'instance' | 'library' | string;
 itemLabel?: string;
 renderExtraFields?: () => ReactNode;
 /**
  * The current user's project-level role (planter/team/admin).
  * Template-only flags are admin-gated; other fields are visible to all roles.
  */
 membershipRole?: string;
 taskType?: string | null;
 projectId?: string | null;
 teamMembers?: TeamMemberWithProfile[];
}

const TaskFormFields = ({
 origin,
 itemLabel = 'Task',
 renderExtraFields,
 membershipRole,
}: TaskFormFieldsProps) => {
 const {
 register,
 formState: { errors },
 } = useFormContext<TaskFormData>();
 const { user } = useAuth();
 const isAdmin = (user as { role?: string })?.role === 'admin';
 const canEditTemplateFlags =
 origin === 'template' && (canEditTemplates(membershipRole) || isAdmin);
 const canTagStrategy = canEditTemplateFlags;

 return (
 <>
 {errors.root?.message && <div className="form-error-banner">{errors.root.message}</div>}

 <div className="space-y-2">
 <Label htmlFor="title">
 {itemLabel} Title <span className="text-red-500">*</span>
 </Label>
 <Input
 type="text"
 id="title"
 autoFocus
 className={errors.title ? 'border-red-500' : ''}
 placeholder={`Enter ${itemLabel.toLowerCase()} title`}
 {...register('title')}
 />
 {errors.title && <span className="text-sm text-red-500">{errors.title.message}</span>}
 </div>

 <div className="space-y-4 pt-2">
 <div className="space-y-2">
 <Label htmlFor="purpose">Purpose (The Why)</Label>
 <Textarea
 id="purpose"
 placeholder={`Why is this ${itemLabel.toLowerCase()} needed?`}
 rows={2}
 {...register('purpose')}
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="description">Description</Label>
 <Textarea
 id="description"
 placeholder={`Describe the ${itemLabel.toLowerCase()}...`}
 rows={3}
 {...register('description')}
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="actions">Action Steps (The What)</Label>
 <Textarea
 id="actions"
 placeholder="Specific actions to take..."
 rows={2}
 {...register('actions')}
 />
 </div>

 {isAdmin && (
 <div className="space-y-2">
 <Label htmlFor="notes">Notes / Context</Label>
 <Textarea
 id="notes"
 placeholder="Internal notes, hints, or context..."
 rows={2}
 {...register('notes')}
 />
 </div>
 )}
 </div>

 {origin === 'instance' && (
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-4">
 <div className="space-y-2">
 <Label htmlFor="days_from_start">Days from Start</Label>
 <div className="relative">
 <Input
 type="number"
 id="days_from_start"
 className={`pl-10 ${errors.days_from_start ? 'border-red-500' : ''}`}
 placeholder="0"
 min="0"
 {...register('days_from_start', { valueAsNumber: true })}
 />
 <div className="pointer-events-none absolute left-0 top-0 flex h-full w-10 items-center justify-center text-slate-400">
 <span className="text-sm font-medium">T+</span>
 </div>
 </div>
 {errors.days_from_start && <span className="text-sm text-red-500">{errors.days_from_start.message}</span>}
 <p className="text-xs text-slate-500">
 Auto-calculates dates based on project start
 </p>
 </div>
 </div>
 )}

 {canTagStrategy && (
 <div className="mt-3 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
 <input
 type="checkbox"
 id="is_strategy_template"
 data-testid="is-strategy-template-checkbox"
 className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
 {...register('is_strategy_template')}
 />
 <div className="flex flex-col gap-0.5">
 <Label htmlFor="is_strategy_template" className="cursor-pointer text-sm font-medium">
 Strategy template
 </Label>
 <p className="text-xs text-slate-500">
 Cloned project instances offer Master Library follow-ups when completed.
 </p>
 </div>
 </div>
 )}

 {renderExtraFields && renderExtraFields()}

 {origin === 'instance' && (
 <div className="my-6 border-t border-slate-200 pt-4">
 <h4 className="mb-4 text-sm font-medium text-slate-700">Manual Schedule Overrides</h4>
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div className="space-y-2">
 <Label htmlFor="start_date">Start Date</Label>
 <Input
 type="date"
 id="start_date"
 {...register('start_date')}
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="due_date">Due Date</Label>
 <Input
 type="date"
 id="due_date"
 className={errors.due_date ? 'border-red-500' : ''}
 {...register('due_date')}
 />
 {errors.due_date && <span className="text-sm text-red-500">{errors.due_date.message}</span>}
 </div>
 </div>
 </div>
 )}
 </>
 );
};

export default TaskFormFields;
