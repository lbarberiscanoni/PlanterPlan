import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import { ChevronRight, Plus } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { cn } from '@/shared/lib/utils';
import { TASK_STATUS } from '@/shared/constants';
import { SortableTaskItem } from '@/features/tasks/components/TaskItem';
import InlineTaskInput from '@/features/tasks/components/InlineTaskInput';

import { TaskRow, Task } from '@/shared/db/app.types';
import type { TaskUpdate } from '@/shared/db/app.types';
import type { PresenceState } from '@/shared/types/presence';

interface TaskWithState extends Task {
    isExpanded?: boolean;
    isAddingInline?: boolean;
    children?: TaskWithState[];
}

export interface MilestoneSectionProps {
    milestone: TaskRow;
    tasks?: TaskWithState[];
    onTaskUpdate?: (id: string, data: Partial<TaskUpdate>) => void;
    onAddChildTask?: (parent: TaskRow) => void;
    onTaskClick: (task: TaskRow) => void;
    onToggleExpand?: (task: TaskRow, expanded: boolean) => void;
    onInlineCommit?: (parentId: string, title: string, templateData?: Partial<TaskRow>) => Promise<void>;
    onInlineCancel?: () => void;
    canEdit?: boolean;
    canUpdateTaskStatus?: (task: TaskRow) => boolean;
    disableDrag?: boolean;
    isAddingInline?: boolean;
    dropIndicator?: { parentId: string; beforeTaskId: string | null; nestInId?: string } | null;
    /** Wave 27: presence roster forwarded to each TaskItem so rows can render focus chips. */
    presentUsers?: PresenceState[];
    /** Wave 27: current viewer's id so TaskItem hides its own focus chip. */
    currentUserId?: string | null;
}

export default function MilestoneSection({
    milestone,
    tasks = [],
    onTaskUpdate,
    onAddChildTask,
    onTaskClick,
    onToggleExpand,
    onInlineCommit,
    onInlineCancel,
    canEdit = true,
    canUpdateTaskStatus,
    disableDrag = false,
    isAddingInline = false,
    dropIndicator,
    presentUsers = [],
    currentUserId = null,
}: MilestoneSectionProps) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(true);

    const { setNodeRef, isOver } = useDroppable({
        id: `milestone-context-${milestone.id}`,
        data: {
            type: 'container',
            parentId: milestone.id,
            origin: 'milestone', // or task? but it acts as a parent container
        },
    });

    // Memoize so every parent re-render doesn't re-filter + re-sort the
    // tasks for each milestone. Combined with React.memo on SortableTaskItem
    // (added in Phase 2), the tree stops cascading re-renders on realtime
    // ticks and selection changes.
    const milestoneTasks = useMemo(
        () => tasks
            .filter((t) => t.parent_task_id === milestone.id)
            .sort((a, b) => (a.position || 0) - (b.position || 0)),
        [tasks, milestone.id],
    );
    const completedTasks = useMemo(
        () => milestoneTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length,
        [milestoneTasks],
    );
    const totalTasks = milestoneTasks.length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Hoist the status-update adapter so every row gets the same function
    // reference across renders — prerequisite for React.memo to actually
    // short-circuit re-renders on sibling changes.
    const handleRowStatus = useCallback(
        (id: string, status: string) => onTaskUpdate?.(id, { status } as Partial<TaskRow>),
        [onTaskUpdate],
    );

    return (
        <div
            data-testid="milestone-section"
            ref={setNodeRef}
            className={cn(
                "border rounded-xl overflow-hidden transition-all duration-200",
                isOver ? "border-brand-400 bg-brand-50/50 ring-2 ring-brand-200 " : "border-slate-200 bg-white shadow-sm hover:shadow-md"
            )}
        >
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-4">
                    <div className={cn('transition-transform duration-200', isExpanded && 'rotate-90')}>
                        <ChevronRight className="w-5 h-5 text-slate-400" aria-hidden="true" />
                    </div>

                    <div className="text-left">
                        <h4 className="font-semibold text-slate-900">{milestone.title}</h4>
                        {milestone.description && (
                            <p className="text-sm text-slate-500 mt-0.5">{milestone.description}</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {milestone.origin !== 'template' && (
                        <div className="hidden sm:flex items-center gap-3">
                            <div className="w-32">
                                <Progress value={progress} className="h-2 bg-slate-100" />
                            </div>
                            <span className="text-sm font-medium text-slate-600 w-12 text-right">{progress}%</span>
                        </div>
                    )}
                    {milestone.is_locked && (
                        <Badge
                            variant="outline"
                            className="text-xs px-1.5 h-5 bg-slate-50 text-slate-500 border-slate-200"
                        >
                            {t('projects.locked_label')}
                        </Badge>
                    )}
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                        {completedTasks}/{totalTasks}
                    </Badge>
                </div>
            </button>

            {isExpanded && (
                <div>
                    <div className="px-5 pb-4 border-t border-slate-100">
                            {milestoneTasks.length === 0 && !isAddingInline ? (
                                <div className="py-8 text-center">
                                    <p className="text-slate-500 mb-4">{t('projects.no_tasks_yet')}</p>
                                    {canEdit && onAddChildTask && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onAddChildTask(milestone)}
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            {t('projects.add_task_button')}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div
                                    role="tree"
                                    aria-label={t('projects.milestone_tasks_aria', { title: milestone.title ?? '' })}
                                    className="space-y-2 pt-4"
                                >
                                    <SortableContext items={milestoneTasks.map(t => t.id)}>
                                        {milestoneTasks.map((task) => (
                                            <div key={task.id}>
                                                {dropIndicator?.beforeTaskId === task.id && dropIndicator?.parentId === milestone.id && (
                                                    <div className="h-0.5 bg-blue-500 rounded-full mx-4 my-1" />
                                                )}
                                                <SortableTaskItem
                                                    task={task}
                                                    level={0}
                                                    onTaskClick={onTaskClick}
                                                    onStatusChange={handleRowStatus}
                                                    canUpdateStatus={canUpdateTaskStatus ? canUpdateTaskStatus(task) : Boolean(onTaskUpdate)}
                                                    canUpdateStatusForTask={canUpdateTaskStatus}
                                                    onAddChildTask={onAddChildTask}
                                                    onToggleExpand={onToggleExpand}
                                                    disableDrag={disableDrag}
                                                    isAddingInline={task.isAddingInline}
                                                    onInlineCommit={onInlineCommit}
                                                    onInlineCancel={onInlineCancel}
                                                    dropIndicator={dropIndicator}
                                                    presentUsers={presentUsers}
                                                    currentUserId={currentUserId}
                                                />
                                            </div>
                                        ))}

                                        {dropIndicator?.beforeTaskId === null && dropIndicator?.parentId === milestone.id && (
                                            <div className="h-0.5 bg-blue-500 rounded-full mx-4 my-1" />
                                        )}

                                        {isAddingInline && onInlineCommit && onInlineCancel && (
                                            <div className="mt-2 animate-slide-up">
                                                <InlineTaskInput
                                                    onCommit={(title) => onInlineCommit(milestone.id, title)}
                                                    onCommitFromTemplate={(template) => onInlineCommit(milestone.id, template.title || '', template as Partial<TaskRow>)}
                                                    onCancel={onInlineCancel}
                                                    placeholder={t('tasks.list.inline_add_placeholder')}
                                                />
                                            </div>
                                        )}

                                        {!isAddingInline && canEdit && onAddChildTask && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full text-slate-500 hover:text-slate-700 mt-2"
                                                onClick={() => onAddChildTask(milestone)}
                                            >
                                                <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                                                {t('projects.add_task_button')}
                                            </Button>
                                        )}
                                    </SortableContext>
                                </div>
                            )}
                        </div>
                </div>
            )}
        </div>
    );
}
