import { useFormContext, useWatch } from 'react-hook-form';
import { useMemo, type ReactNode } from 'react';
import type { TaskFormData, TeamMemberWithProfile } from '@/shared/db/app.types';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useAuth } from '@/shared/contexts/auth-context';

interface TaskFormFieldsProps {
 origin?: 'instance' | 'library' | string;
 itemLabel?: string;
 renderExtraFields?: () => ReactNode;
 /**
  * The current user's project-level role (owner/editor/coach/viewer/limited).
  * Optional — when omitted, permission-scoped controls like the "Coaching task"
  * checkbox stay hidden. Project.tsx derives this from `teamMembers`.
  */
 membershipRole?: string;
 /** Wave 29: the row's task_type — gates the Phase Lead picker to phases/milestones. */
 taskType?: string | null;
 /** Wave 29: the project root id — required for `useTeam(projectId)` when the Phase Lead picker renders. */
 projectId?: string | null;
 /** Project team members supplied by the page/composition layer. */
 teamMembers?: TeamMemberWithProfile[];
}

function getMemberLabel(member: TeamMemberWithProfile): string {
 const email = typeof member.email === 'string' && member.email.length > 0 ? member.email : null;
 return email ?? `User ${member.user_id.slice(0, 8)}`;
}

/**
 * Wave 29: Phase Leads picker. Extracted as a sub-component so the `useTeam`
 * query hook is only mounted when the picker actually renders — keeping
 * QueryClientProvider as a per-test optional dependency for pre-existing
 * TaskForm tests that don't exercise Phase Leads.
 */
function PhaseLeadPicker({
 projectId,
 taskType,
 teamMembers,
}: {
 projectId: string | null | undefined;
 taskType: string | null | undefined;
 teamMembers: TeamMemberWithProfile[];
}) {
 const active = Boolean(projectId) && (taskType === 'phase' || taskType === 'milestone');
 const { setValue, control } = useFormContext<TaskFormData>();
 const eligibleMembers = useMemo(
 () => teamMembers.filter((m) => m.role === 'viewer' || m.role === 'limited'),
 [teamMembers],
 );
 const watched = useWatch({ control, name: 'phase_lead_user_ids' });
 const selectedLeads = useMemo(() => watched ?? [], [watched]);
 const selectedSet = useMemo(() => new Set(selectedLeads), [selectedLeads]);
 const selectedLabels = useMemo(() => {
 const byId = new Map<string, string>();
 for (const m of eligibleMembers) {
 byId.set(m.user_id, getMemberLabel(m));
 }
 return selectedLeads.map((id) => byId.get(id) ?? `User ${id.slice(0, 8)}`);
 }, [eligibleMembers, selectedLeads]);
 const togglePhaseLead = (userId: string) => {
 const next = selectedSet.has(userId)
 ? selectedLeads.filter((v) => v !== userId)
 : [...selectedLeads, userId];
 setValue('phase_lead_user_ids', next, { shouldDirty: true });
 };
 if (!active) return null;
 return (
 <div
  className="mt-3 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
  data-testid="phase-lead-picker"
 >
  <div className="flex flex-col gap-0.5">
   <Label className="text-sm font-medium">Phase Leads</Label>
   <p className="text-xs text-slate-500">
    Viewer/Limited members chosen here may edit tasks under this {taskType}.
   </p>
  </div>
  <Popover>
   <PopoverTrigger asChild>
    <Button
     type="button"
     variant="outline"
     size="sm"
     data-testid="phase-lead-picker-trigger"
     className="w-full justify-between"
    >
     <span className="truncate text-left">
      {selectedLabels.length === 0 ? 'Select members…' : selectedLabels.join(', ')}
     </span>
     <span className="ml-2 text-xs text-slate-500">{selectedLabels.length}</span>
    </Button>
   </PopoverTrigger>
   <PopoverContent align="start" className="w-72 p-2">
    {eligibleMembers.length === 0 ? (
     <p className="px-2 py-3 text-sm text-slate-500">
      No viewer or limited members to designate.
     </p>
    ) : (
     <ul className="flex flex-col gap-1">
     {eligibleMembers.map((m) => {
       const label = getMemberLabel(m);
       const checked = selectedSet.has(m.user_id);
       return (
        <li key={m.user_id}>
         <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100">
          <input
           type="checkbox"
           checked={checked}
           onChange={() => togglePhaseLead(m.user_id)}
           className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="flex-1 truncate">{label}</span>
          <span className="text-xs text-slate-400">{m.role}</span>
         </label>
        </li>
       );
      })}
     </ul>
    )}
   </PopoverContent>
  </Popover>
 </div>
 );
}

const TaskFormFields = ({
 origin,
 itemLabel = 'Task',
 renderExtraFields,
 membershipRole,
 taskType,
 projectId,
 teamMembers = [],
}: TaskFormFieldsProps) => {
 const {
 register,
 formState: { errors },
 } = useFormContext<TaskFormData>();
 const { user } = useAuth();
 const isAdmin = (user as { role?: string })?.role === 'admin';
 const canEditTemplateFlags =
 origin === 'template'
 && (
 membershipRole === 'owner'
 || membershipRole === 'editor'
 || membershipRole === 'admin'
 || isAdmin
 );
 const canTagCoaching = canEditTemplateFlags;
 const canTagStrategy = canEditTemplateFlags;
 const canAssignPhaseLeads =
 origin === 'instance'
 && membershipRole === 'owner'
 && (taskType === 'phase' || taskType === 'milestone')
 && Boolean(projectId);

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

 {canTagCoaching && (
 <div className="mt-4 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
 <input
 type="checkbox"
 id="is_coaching_task"
 data-testid="is-coaching-task-checkbox"
 className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
 {...register('is_coaching_task')}
 />
 <div className="flex flex-col gap-0.5">
 <Label htmlFor="is_coaching_task" className="cursor-pointer text-sm font-medium">
 Coaching task
 </Label>
 <p className="text-xs text-slate-500">
 Cloned project instances keep this as a coaching task for Coach-role progress updates.
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

 {canAssignPhaseLeads && (
 <PhaseLeadPicker projectId={projectId} taskType={taskType} teamMembers={teamMembers} />
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
