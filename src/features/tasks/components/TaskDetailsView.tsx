import { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import TaskResources from '@/features/tasks/components/TaskResources';
import TaskDependencies from '@/features/tasks/components/TaskDependencies';
import TaskComments from '@/features/tasks/components/TaskComments/TaskComments';
import { useTaskActivity } from '@/features/projects/hooks/useProjectActivity';
import { ActivityRow } from '@/features/projects/components/ActivityRow';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useTaskSiblings } from '@/features/tasks/hooks/useTaskSiblings';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import type { TaskItemData } from '@/features/tasks/components/TaskItem';
import type { TaskRow } from '@/shared/db/app.types';
import { extractCoachingFlag } from '@/features/tasks/lib/coaching-form';
import { extractStrategyTemplateFlag } from '@/features/tasks/lib/strategy-form';
import { extractPhaseLeads } from '@/features/projects/lib/phase-lead';
import { useTeam } from '@/features/people/hooks/useTeam';
import StrategyFollowUpDialog from '@/features/tasks/components/StrategyFollowUpDialog';
import { collectSpawnedTemplateIds } from '@/shared/lib/tree-helpers';

const emailDetailsSchema = z.object({
    recipient: z.string().email('Enter a valid email'),
});
type EmailDetailsFormData = z.infer<typeof emailDetailsSchema>;

function buildEmailBody(task: TaskItemData): string {
    const lines: string[] = [`Task: ${task.title}`];
    if (task.purpose) lines.push('', `Purpose:`, task.purpose);
    if (task.actions) lines.push('', `Actions:`, task.actions);
    lines.push('', `Start: ${formatDisplayDate(task.start_date) || '—'}`);
    lines.push(`Due: ${formatDisplayDate(task.due_date) || '—'}`);
    if (typeof window !== 'undefined') {
        const projectId = task.root_id || task.id;
        lines.push('', `Link: ${window.location.origin}/project/${projectId}`);
    }
    return lines.join('\n');
}

interface TaskDetailsViewProps {
    task?: TaskItemData | null;
    onAddChildTask?: (task: TaskItemData) => void;
    onEditTask?: (task: TaskItemData) => void;
    onDeleteTask?: (task: TaskItemData) => void;
    onTaskUpdated?: () => void;
    canEdit?: boolean;
    allProjectTasks?: TaskItemData[];
    /**
     * Wave 36 Task 2: used by the delete-guard modal. When the task has
     * `cloned_from_task_id IS NOT NULL` and `membershipRole !== 'owner'`,
     * the modal blocks the delete with a "only the project owner can
     * delete template-origin tasks" message.
     */
    membershipRole?: string;
    [key: string]: unknown;
}

const TaskDetailsView = ({
    task,
    onAddChildTask,
    onDeleteTask,
    onTaskUpdated,
    canEdit = true,
    membershipRole,
    ...props
}: TaskDetailsViewProps) => {
    const { user, savedEmailAddresses, rememberEmailAddress } = useAuth();
    const { data: siblings = [] } = useTaskSiblings(task?.id, task?.parent_task_id);
    const [emailOpen, setEmailOpen] = useState(false);
    const [strategyDialogOpen, setStrategyDialogOpen] = useState(false);
    // Wave 36 Task 2: delete-guard modal state for template-origin tasks.
    const [deleteGuardOpen, setDeleteGuardOpen] = useState(false);
    const isTemplateOrigin = Boolean(
        (task as (TaskItemData & { cloned_from_task_id?: string | null }) | null)?.cloned_from_task_id,
    );
    const isProjectOwner = membershipRole === 'owner';

    // Edge-trigger the Strategy Template follow-up dialog: fires exactly once
    // per transition into `completed`, regardless of how many re-renders happen
    // with the already-completed row in cache.
    const prevStatusRef = useRef<string | null | undefined>(task?.status);
    const isStrategyTask = extractStrategyTemplateFlag(task as TaskRow | undefined);
    const phaseLeadIds = useMemo(
        () => extractPhaseLeads(task as TaskRow | undefined),
        [task],
    );
    const phaseLeadProjectId = task?.root_id ?? task?.id ?? null;
    const { teamMembers: phaseLeadMembers } = useTeam(phaseLeadIds.length > 0 ? phaseLeadProjectId : null);
    const phaseLeadLabels = useMemo(
        () => phaseLeadIds.map((id) => {
            const member = phaseLeadMembers.find((m) => m.user_id === id);
            const email = member ? (member as unknown as { email?: string }).email : undefined;
            return email ?? `User ${id.slice(0, 8)}`;
        }),
        [phaseLeadIds, phaseLeadMembers],
    );
    useEffect(() => {
        const prev = prevStatusRef.current;
        const curr = task?.status;
        if (isStrategyTask && prev !== 'completed' && curr === 'completed') {
            // Defer state update to next microtask to avoid react-hooks/set-state-in-effect
            queueMicrotask(() => {
                setStrategyDialogOpen(true);
            });
        }
        prevStatusRef.current = curr;
    }, [task?.status, isStrategyTask]);

    const allProjectTasksProp = props.allProjectTasks as TaskRow[] | undefined;
    const strategyExcludeIds = useMemo(
        () => Array.from(collectSpawnedTemplateIds(allProjectTasksProp ?? [])),
        [allProjectTasksProp],
    );
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<EmailDetailsFormData>({
        resolver: zodResolver(emailDetailsSchema),
        defaultValues: { recipient: '' },
    });

    if (!task) {
        return <div className="p-4 text-center text-muted-foreground">Select a task to view details</div>;
    }

    const emailBody = buildEmailBody(task);

    const openEmailDialog = () => {
        reset({ recipient: savedEmailAddresses[0] || '' });
        setEmailOpen(true);
    };

    const onEmailSubmit = async (data: EmailDetailsFormData) => {
        await rememberEmailAddress(data.recipient);
        const subject = encodeURIComponent(`Task: ${task.title}`);
        const body = encodeURIComponent(emailBody);
        window.location.assign(`mailto:${data.recipient}?subject=${subject}&body=${body}`);
        setEmailOpen(false);
    };

    // Determine hierarchy level
    const getTaskLevel = () => {
        if (!task.parent_task_id) return 0;
        return 1;
    };

    const level = getTaskLevel();
    const canHaveChildren = level < 3;

    // Check valid subscription or override for local dev/admin if needed.
    // For now, strict check on subscription_status.
    const hasLicense = (user as { subscription_status?: string })?.subscription_status === 'active' || (user as { subscription_status?: string })?.subscription_status === 'trialing';
    const isLocked = !!task.is_premium && !hasLicense;

    return (
        <div className="task-details px-4 pb-10">
            {/* Premium Lock Screen */}
            {isLocked ? (
                <div className="p-8 text-center bg-muted/30 border-2 border-dashed border-border rounded-xl my-6">
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-purple-600 " fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    </div>
                    <h3 className="text-lg font-bold text-card-foreground mb-2">Premium Content Locked</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                        This content is part of the Premium PlanterPlan curriculum. Upgrade to unlock full access to detailed guides, resources, and templates.
                    </p>
                    <button className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg shadow-sm transition-colors">
                        Upgrade to Premium
                    </button>
                </div>
            ) : (
                <>
                    {/* Purpose (The Why) — prominent, first */}
                    {task.purpose && (
                        <div className="detail-section mb-6">
                            <h3 className="text-base font-semibold text-slate-800 mb-2">
                                Purpose (The Why)
                            </h3>
                            <p className="text-slate-700 leading-relaxed text-base whitespace-pre-wrap">{task.purpose}</p>
                        </div>
                    )}

                    {/* Overview / Description — flowing text */}
                    {task.description && (
                        <div className="detail-section mb-6">
                            <h3 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
                                Overview
                            </h3>
                            <p className="text-slate-600 leading-relaxed text-sm whitespace-pre-wrap">{task.description}</p>
                        </div>
                    )}

                    {/* Action Steps (The What) — keep green box */}
                    {task.actions && (
                        <div className="detail-section mb-6">
                            <h3 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
                                Action Steps (The What)
                            </h3>
                            <div className="p-4 bg-green-50 border border-green-200 text-slate-700 leading-relaxed text-sm whitespace-pre-wrap">
                                {task.actions}
                            </div>
                        </div>
                    )}

                    {/* Resources */}
                    <div className="mb-6 pt-4 border-t border-slate-100">
                        <TaskResources
                            taskId={task.id}
                            primaryResourceId={task.primary_resource_id}
                            onUpdate={onTaskUpdated}
                        />
                    </div>
                </>
            )}

            {/* Schedule — hidden for template tasks */}
            {task.origin !== 'template' && (
            <div className="detail-section mb-6">
                <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Schedule</h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-card border border-border rounded-lg shadow-sm flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Start Date
                        </span>
                        <span className="text-sm font-bold text-card-foreground tracking-tight">
                            {formatDisplayDate(task.start_date)}
                        </span>
                    </div>
                    <div className="p-4 bg-card border border-border rounded-lg shadow-sm flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Due Date
                        </span>
                        <span className="text-sm font-bold text-card-foreground tracking-tight">
                            {formatDisplayDate(task.due_date)}
                        </span>
                    </div>
                </div>
            </div>
            )}

            {/* Status Badges */}
            <div className="detail-section mb-6">
                <div className="flex flex-wrap gap-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Type
                        </span>
                        <span
                            className={`task-type-badge inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border ${task.origin === 'instance' ? 'bg-brand-50 text-brand-700 border-brand-100 ' : 'bg-muted text-muted-foreground border-border'}`}
                        >
                            {task.origin === 'instance' ? 'Project Task' : 'Template'}
                        </span>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Status
                        </span>
                        {task.is_complete ? (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">
                                <svg width="12" height="12" fill="currentColor" className="mr-1.5">
                                    <path
                                        d="M10 3L4.5 8.5L2 6"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                                Complete
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-amber-50 text-amber-700 border-amber-100">
                                <span className="w-2 h-2 rounded-full bg-amber-400 mr-2"></span>
                                Incomplete
                            </span>
                        )}
                    </div>

                    {task.is_premium && (
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Access
                            </span>
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-purple-50 text-purple-700 border-purple-100">
                                Premium
                            </span>
                        </div>
                    )}

                    {extractCoachingFlag(task as TaskRow) && (
                        <div className="flex flex-col gap-1" data-testid="coaching-badge-group">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Access
                            </span>
                            <span
                                data-testid="coaching-badge"
                                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-sky-50 text-sky-700 border-sky-100"
                            >
                                Coaching
                            </span>
                        </div>
                    )}

                    {isStrategyTask && (
                        <div className="flex flex-col gap-1" data-testid="strategy-badge-group">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Type
                            </span>
                            <span
                                data-testid="strategy-badge"
                                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-100"
                            >
                                Strategy Template
                            </span>
                        </div>
                    )}

                    {phaseLeadIds.length > 0 && (
                        <div className="flex flex-col gap-1" data-testid="phase-lead-badge-group">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Phase Leads
                            </span>
                            <span
                                data-testid="phase-lead-badge"
                                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-purple-50 text-purple-700 border-purple-100"
                            >
                                {phaseLeadLabels.join(', ')}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="h-px bg-slate-100 my-4"></div>

            <TaskDependencies task={task as TaskRow} allProjectTasks={(props.allProjectTasks as TaskRow[]) || []} />

            {/* Related Tasks (Siblings) */}
            {task.parent_task_id && (
                <div className="detail-section mb-6" data-testid="related-tasks-section">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Related Tasks</h3>
                    {siblings.length > 0 ? (
                        <div className="space-y-2">
                            {siblings.map((sibling) => (
                                <div
                                    key={sibling.id}
                                    data-testid={`related-task-${sibling.id}`}
                                    className="p-3 bg-card border border-border rounded-lg shadow-sm flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${sibling.is_complete ? 'bg-emerald-500' : 'bg-amber-400'}`}></div>
                                        <span className={`text-sm font-medium ${sibling.is_complete ? 'text-muted-foreground line-through' : 'text-card-foreground'}`}>
                                            {sibling.title}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No sibling tasks in this milestone.</p>
                    )}
                </div>
            )}

            {/* Comments (Wave 26) */}
            <TaskComments taskId={task.id} />

            {/* Activity (Wave 27) */}
            <TaskActivityRail taskId={task.id} />

            {/* Subtasks */}
            {task.children && task.children.length > 0 && (
                <div className="detail-section mb-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Subtasks</h3>
                    <div className="space-y-2">
                        {task.children.map((child: TaskRow) => (
                            <div key={child.id} className="p-3 bg-card border border-border rounded-lg shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${child.is_complete ? 'bg-emerald-500' : 'bg-amber-400'}`}></div>
                                    <span className={`text-sm font-medium ${child.is_complete ? 'text-muted-foreground line-through' : 'text-card-foreground'}`}>
                                        {child.title}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add Child Task */}
            {onAddChildTask && canHaveChildren && canEdit && (
                <div className="detail-section mb-8">
                    <button
                        type="button"
                        onClick={() => onAddChildTask(task)}
                        className="w-full py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 shadow-md transition-all font-medium"
                    >
                        + Add Child Task
                    </button>
                </div>
            )}

            {/* Notes — only visible to P4P admins */}
            {task.notes && (user as { role?: string })?.role === 'admin' && (
                <div className="detail-section mb-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">Notes</h3>
                    <div className="p-3 bg-amber-50 border border-amber-100 text-slate-700 text-sm italic">
                        {task.notes}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 mb-6">
                <button
                    type="button"
                    onClick={openEmailDialog}
                    data-testid="email-details-btn"
                    className="flex-1 py-3 px-4 bg-card border border-border text-card-foreground rounded-lg shadow-sm hover:bg-muted hover:shadow-md transition-all font-medium text-sm"
                >
                    Email details
                </button>

                {onDeleteTask && canEdit && (
                    <button
                        type="button"
                        onClick={() => {
                            // Wave 36 Task 2: template-origin guard. Non-owners
                            // see a modal before deleting cloned-from-template
                            // rows. Owners bypass the modal.
                            if (isTemplateOrigin && !isProjectOwner) {
                                setDeleteGuardOpen(true);
                                return;
                            }
                            onDeleteTask(task);
                        }}
                        data-testid="delete-task-btn"
                        className="flex-1 py-3 px-4 bg-card border border-rose-200 text-rose-600 rounded-lg shadow-sm hover:bg-rose-50 hover:shadow-md transition-all font-medium text-sm"
                    >
                        Delete Task
                    </button>
                )}
            </div>

            {/* Email Details Dialog */}
            <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
                <DialogContent data-testid="email-details-dialog">
                    <DialogHeader>
                        <DialogTitle>Email task details</DialogTitle>
                        <DialogDescription>
                            Send a summary of this task via your mail client.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onEmailSubmit)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="email-recipient">Recipient</Label>
                            <Input
                                id="email-recipient"
                                type="email"
                                list="email-recipient-suggestions"
                                placeholder="name@example.com"
                                data-testid="email-recipient-input"
                                {...register('recipient')}
                            />
                            <datalist id="email-recipient-suggestions">
                                {savedEmailAddresses.map((addr) => (
                                    <option key={addr} value={addr} />
                                ))}
                            </datalist>
                            {errors.recipient && (
                                <p className="text-xs text-rose-600" data-testid="email-recipient-error">
                                    {errors.recipient.message}
                                </p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="email-body">Message</Label>
                            <Textarea
                                id="email-body"
                                readOnly
                                rows={8}
                                value={emailBody}
                                data-testid="email-body-preview"
                                className="font-mono text-xs"
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEmailOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                data-testid="email-send-btn"
                            >
                                Send
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Wave 36 Task 2: template-origin delete guard. */}
            <Dialog open={deleteGuardOpen} onOpenChange={setDeleteGuardOpen}>
                <DialogContent data-testid="template-origin-delete-guard">
                    <DialogHeader>
                        <DialogTitle>Cannot delete template task</DialogTitle>
                        <DialogDescription>
                            This task originated from the project template. Only the project owner
                            can delete template-origin tasks.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteGuardOpen(false)}
                        >
                            OK
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {isStrategyTask && (
                <StrategyFollowUpDialog
                    task={task as TaskRow}
                    open={strategyDialogOpen}
                    onOpenChange={setStrategyDialogOpen}
                    excludeTemplateIds={strategyExcludeIds}
                />
            )}

            {/* Metadata Footer */}
            <div className="pt-6 border-t border-slate-100 text-xs text-slate-400 flex flex-col gap-1">
                <div className="flex justify-between">
                    <span>Created</span>
                    <span className="font-mono text-slate-500">{formatDisplayDate(task.created_at)}</span>
                </div>
                {task.updated_at && (
                    <div className="flex justify-between">
                        <span>Updated</span>
                        <span className="font-mono text-slate-500">{formatDisplayDate(task.updated_at)}</span>
                    </div>
                )}
                <div className="flex justify-between mt-2">
                    <span>ID</span>
                    <span className="font-mono opacity-50">{task.id.slice(0, 8)}...</span>
                </div>
            </div>
        </div >
    );
};

/** Collapsed per-task activity rail. Always mounts the query so the
 *  count surfaces in the summary; body renders only when `<details>` is open. */
function TaskActivityRail({ taskId }: { taskId: string }) {
    const { data: rows = [], isLoading } = useTaskActivity(taskId, { limit: 20 });
    return (
        <details className="detail-section mb-6 group" data-testid="task-activity-rail">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wide">
                <span>Activity</span>
                <span className="text-xs text-slate-500 normal-case font-medium">
                    ({rows.length})
                </span>
            </summary>
            <div className="mt-3 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                {isLoading ? (
                    <p className="text-sm text-slate-500">Loading activity…</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-slate-500" data-testid="task-activity-empty">
                        No activity yet.
                    </p>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {rows.map((r) => (
                            <ActivityRow key={r.id} row={r} hideEntityLink />
                        ))}
                    </div>
                )}
            </div>
        </details>
    );
}

export default TaskDetailsView;
