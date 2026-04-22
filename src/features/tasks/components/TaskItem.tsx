import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import RoleIndicator from '@/shared/ui/RoleIndicator';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/shared/lib/utils';
import { TASK_STATUS_BORDER } from '@/shared/constants/colors';
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from '@/shared/ui/ErrorFallback';
import { Lock, Link as LinkIcon, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import TaskStatusSelect from './TaskStatusSelect';
import TaskControlButtons from './TaskControlButtons';
import InlineTaskInput from './InlineTaskInput';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import {
 dueBadgeToneClass,
 formatTaskDueBadge,
} from '@/shared/lib/date-engine/formatTaskDueBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import type { PresenceState } from '@/features/projects/hooks/useProjectPresence';

export type { TaskItemData } from '@/shared/types/tasks';
import type { TaskItemData } from '@/shared/types/tasks';

type DragHandleProps = React.HTMLAttributes<HTMLButtonElement> & {
 ref?: React.Ref<HTMLElement>;
};

interface TaskItemProps {
 task: TaskItemData;
 level?: number;
 onTaskClick?: (task: TaskItemData) => void;
 selectedTaskId?: string | null;
 onAddChildTask?: (task: TaskItemData) => void;
 onInviteMember?: (task: TaskItemData) => void;
 onStatusChange?: (id: string, status: string) => void;
 dragHandleProps?: DragHandleProps;
 onToggleExpand?: (task: TaskItemData, expanded: boolean) => void;
 onEdit?: ((task: TaskItemData) => void) | null;
 onDeleteTask?: ((id: string) => void) | null;
 hideExpansion?: boolean;
 disableDrag?: boolean;
 isAddingInline?: boolean;
 onInlineCommit?: (taskId: string, title: string, templateData?: Record<string, unknown>) => void;
 onInlineCancel?: () => void;
 dropIndicator?: { parentId: string; beforeTaskId: string | null; nestInId?: string } | null;
 /** Wave 27: project-scoped presence roster (threaded from Project.tsx via MilestoneSection). */
 presentUsers?: PresenceState[];
 /** Wave 27: viewer's id — used to hide self from the focus chip group. */
 currentUserId?: string | null;
 /**
  * Wave 33: parent project title. When present, the task title is wrapped in a
  * hover tooltip revealing this text. Used by the unified Tasks page to
  * disambiguate tasks from different projects.
  */
 parentProjectTitle?: string | null;
}

const MAX_FOCUS_CHIPS = 3;

function focusInitials(email: string): string {
 const local = email.split('@')[0] ?? email;
 return local.slice(0, 2).toUpperCase();
}

const TaskItem = ({
 task,
 level = 0,
 onTaskClick,
 selectedTaskId,
 onAddChildTask,
 onInviteMember,
 onStatusChange,
 dragHandleProps = {},
 onToggleExpand,
 onEdit = null,
 onDeleteTask = null,
 hideExpansion = false,
 disableDrag = false,
 isAddingInline = false,
 onInlineCommit,
 onInlineCancel,
 dropIndicator,
 presentUsers = [],
 currentUserId = null,
 parentProjectTitle = null,
}: TaskItemProps) => {
 const { t } = useTranslation();
 const indentWidth = level * 20;
 const isSelected = selectedTaskId === task.id;
 const canHaveChildren = level < 4;

 // Wave 33: right-aligned due-date badge. The threshold defaults to 3 because
 // TaskItem doesn't receive the root-task settings; the tone is a visual hint,
 // not a correctness signal (status filters elsewhere consume the per-project
 // threshold directly).
 const dueBadge = useMemo(
 () => formatTaskDueBadge({ dueDate: task.due_date }),
 [task.due_date],
 );
 const dueBadgeText = dueBadge
 ? dueBadge.kind === 'today'
 ? t('tasks.dueBadge.today')
 : dueBadge.kind === 'tomorrow'
 ? t('tasks.dueBadge.tomorrow')
 : dueBadge.label
 : null;

 const isExpanded = !!task.isExpanded;
 const hasChildren = task.children && task.children.length > 0;
 const showChevron = !hideExpansion && canHaveChildren && hasChildren;

 // Dnd-kit droppable
 const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
 id: `child-context-${task.id}`,
 data: {
 type: 'container',
 parentId: task.id,
 origin: task.origin,
 },
 });

 const handleCardClick = (e: React.MouseEvent) => {
 const target = e.target as HTMLElement;
 if (
 target.closest('.expand-button') ||
 target.closest('select') ||
 target.closest('button') ||
 target.closest('input')
 ) {
 return;
 }
 if (onTaskClick) {
 onTaskClick(task);
 }
 };

 const handleToggleExpandClick = (e: React.MouseEvent) => {
 e.stopPropagation();
 if (onToggleExpand) {
 onToggleExpand(task, !isExpanded);
 }
 };

 const handleStatusChange = (id: string, status: string) => {
 if (status === 'completed' && task.children?.length) {
 const incompleteChildren = task.children.filter((c) => c.status !== 'completed');
 if (incompleteChildren.length > 0) {
 const confirmed = window.confirm(
  `This task has ${incompleteChildren.length} incomplete subtask(s). Mark all as complete?`
 );
 if (!confirmed) return;
 }
 }
 onStatusChange?.(id, status);
 };

 const isLocked = !!task.is_locked;

 // Wave 27: peers currently focused on this task (self-hidden, cap 3).
 // Memoize so DnD reorders / parent re-renders don't re-filter per row.
 const focusPeers = useMemo(
 () => presentUsers.filter((u) => u.focusedTaskId === task.id && u.user_id !== currentUserId),
 [presentUsers, task.id, currentUserId],
 );
 const visibleFocusPeers = focusPeers.slice(0, MAX_FOCUS_CHIPS);
 const focusOverflow = focusPeers.length - visibleFocusPeers.length;

 return (
 <>
 <div
 ref={canHaveChildren ? setDroppableNodeRef : undefined}
 className={cn(
 'relative flex flex-col min-w-0 py-4 px-5 mb-3 rounded-xl border transition-all duration-200 shadow-sm',
 'bg-card text-card-foreground',
 dropIndicator?.nestInId === task.id && 'ring-2 ring-blue-400 bg-blue-50/50 z-10',
 isOver && !dropIndicator?.nestInId && 'ring-2 ring-brand-400 bg-brand-50 z-10',
 isSelected && !isOver
 ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-100'
 : !isOver && 'border-border hover:border-brand-300',
 isLocked && 'opacity-70 bg-muted/30',
 level === 0 && `border-l-4 ${(task.status && TASK_STATUS_BORDER[task.status]) || 'border-l-slate-300'}`
 )}
 style={{ marginLeft: `${indentWidth}px` }}
 onClick={!isLocked ? handleCardClick : undefined}
 data-testid={`task-row-${task.id}`}
 >
 {focusPeers.length > 0 && (
 <div
 className="absolute right-2 top-2 flex items-center gap-1 pointer-events-none"
 data-testid={`task-row-focus-${task.id}`}
 data-focus-peer-count={focusPeers.length}
 >
 {visibleFocusPeers.map((u) => (
 <Avatar
 key={u.user_id}
 className="h-5 w-5 ring-2 ring-white"
 aria-label={`${u.email} is viewing this task.`}
 >
 <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
 {focusInitials(u.email)}
 </AvatarFallback>
 </Avatar>
 ))}
 {focusOverflow > 0 && (
 <Avatar className="h-5 w-5 ring-2 ring-white" aria-label={`${focusOverflow} more viewing this task`}>
 <AvatarFallback className="bg-slate-100 text-slate-500 text-xs font-semibold">
 +{focusOverflow}
 </AvatarFallback>
 </Avatar>
 )}
 </div>
 )}
 <div className="flex items-center justify-between gap-4">
 <div className="flex-1 flex items-center min-w-0 overflow-hidden">
 {!disableDrag && (
 <button
 className={cn(
 'mr-2 p-1 rounded transition-colors flex-shrink-0 cursor-grab active:cursor-grabbing',
 isLocked
 ? 'cursor-not-allowed opacity-30 text-slate-400'
 : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
 )}
 type="button"
 aria-label="Reorder task"
 ref={!isLocked && dragHandleProps.ref ? (dragHandleProps.ref as React.LegacyRef<HTMLButtonElement>) : undefined}
 {...(!isLocked ? (dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>) : {})}
 disabled={isLocked}
 >
 {isLocked ? (
 <Lock className="w-3 h-3" />
 ) : (
 <GripVertical className="w-4 h-4" />
 )}
 </button>
 )}

 {showChevron ? (
 <button
 onClick={handleToggleExpandClick}
 className="expand-button p-1 mr-2 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0"
 aria-label={isExpanded ? 'Collapse' : 'Expand'}
 >
 <svg
 className={cn(
 'transition-transform duration-200',
 isExpanded ? 'rotate-90' : ''
 )}
 width="16"
 height="16"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 >
 <polyline points="9 18 15 12 9 6" />
 </svg>
 </button>
 ) : (
 <div className="w-6 mr-2 flex-shrink-0"></div>
 )}

 <div className="flex items-center gap-3 min-w-0 overflow-hidden">
 {parentProjectTitle ? (
 <Tooltip>
 <TooltipTrigger asChild>
 <span
 className="font-semibold text-slate-900 text-sm truncate cursor-default"
 data-testid={`task-row-title-${task.id}`}
 >
 {task.title}
 </span>
 </TooltipTrigger>
 <TooltipContent>{parentProjectTitle}</TooltipContent>
 </Tooltip>
 ) : (
 <span
 className="font-semibold text-slate-900 text-sm truncate"
 title={task.title}
 data-testid={`task-row-title-${task.id}`}
 >
 {task.title}
 </span>
 )}
 {task.duration && (
 <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500 whitespace-nowrap flex-shrink-0">
 {task.duration}
 </span>
 )}
 {task.resource_type && (
 <span className="px-2.5 py-1 text-xs uppercase font-bold tracking-wider rounded bg-brand-50 text-brand-700 border border-brand-100 whitespace-nowrap flex-shrink-0 flex items-center gap-1">
 <LinkIcon className="w-3 h-3" />
 {task.resource_type}
 </span>
 )}
 {(task as TaskItemData & { cloned_from_task_id?: string | null }).cloned_from_task_id && (
 <Tooltip>
 <TooltipTrigger asChild>
 <span
 className="px-1.5 py-0.5 text-xs uppercase font-semibold rounded bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap flex-shrink-0"
 data-testid={`task-row-template-badge-${task.id}`}
 >
 T
 </span>
 </TooltipTrigger>
 <TooltipContent>From template</TooltipContent>
 </Tooltip>
 )}
 </div>
 </div>

 <div className="flex items-center gap-3 flex-shrink-0">
 {task.membership_role && <RoleIndicator role={task.membership_role} />}

 {dueBadge && dueBadgeText && (
 <span
 className={cn(
 'text-sm font-medium whitespace-nowrap',
 dueBadgeToneClass(dueBadge.tone),
 )}
 data-testid={`task-row-due-badge-${task.id}`}
 data-tone={dueBadge.tone}
 >
 {dueBadgeText}
 </span>
 )}

 <TaskStatusSelect
 status={task.status}
 taskId={task.id}
 onStatusChange={handleStatusChange}
 />

 <TaskControlButtons
 task={task}
 onEdit={() => onEdit?.(task)}
 onAddChild={() => onAddChildTask?.(task)}
 onInvite={() => onInviteMember?.(task)}
 onDelete={onDeleteTask || undefined}
 canHaveChildren={canHaveChildren}
 />
 </div>
 </div>
 </div>

 {canHaveChildren && isExpanded && (
 <div className="pl-0 min-h-[40px]">
 <SortableContext
 items={task.children ? task.children.map((c) => c.id) : []}
 id={`sortable-context-${task.id}`}
 >
 <AnimatePresence mode="popLayout">
 {isAddingInline && onInlineCommit && (
 <motion.div
 layout
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
 className="ml-6 mb-2"
 >
 <InlineTaskInput
 onCommit={(title) => onInlineCommit(task.id, title)}
 onCommitFromTemplate={(template) => onInlineCommit(task.id, template.title || '', template)}
 onCancel={onInlineCancel || (() => { })}
 level={level + 1}
 />
 </motion.div>
 )}

 {task.children && task.children.length > 0 ? (
 <>
 {task.children.map((child) => (
 <motion.div
 key={child.id}
 layout
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
 >
 {dropIndicator?.beforeTaskId === child.id && dropIndicator?.parentId === task.id && (
 <div className="h-0.5 bg-blue-500 rounded-full mx-4 my-1" style={{ marginLeft: `${(level + 1) * 20}px` }} />
 )}
 <SortableTaskItem
 task={child}
 level={level + 1}
 onTaskClick={onTaskClick}
 selectedTaskId={selectedTaskId}
 onAddChildTask={onAddChildTask}
 onInviteMember={onInviteMember}
 onStatusChange={onStatusChange}
 onToggleExpand={onToggleExpand}
 onEdit={onEdit}
 onDeleteTask={onDeleteTask ? () => onDeleteTask(child.id) : undefined}
 isAddingInline={child.isAddingInline}
 onInlineCommit={onInlineCommit}
 onInlineCancel={onInlineCancel}
 dropIndicator={dropIndicator}
 />
 </motion.div>
 ))}
 {dropIndicator?.beforeTaskId === null && dropIndicator?.parentId === task.id && (
 <div className="h-0.5 bg-blue-500 rounded-full mx-4 my-1" style={{ marginLeft: `${(level + 1) * 20}px` }} />
 )}
 </>
 ) : (
 !isAddingInline && (
 <div className="py-2 px-4 text-xs text-slate-400 italic border-2 border-dashed border-slate-100 rounded-lg ml-6">
 Drop subtasks here
 </div>
 )
 )}
 </AnimatePresence>
 </SortableContext>
 </div>
 )}
 </>
 );
};

interface SortableTaskItemProps extends TaskItemProps {
 task: TaskItemData;
 level: number;
}

export const SortableTaskItem = function SortableTaskItem({ task, level, ...props }: SortableTaskItemProps) {
 const {
 attributes,
 listeners,
 setNodeRef,
 setActivatorNodeRef,
 isDragging,
 } = useSortable({
 id: task.id,
 data: {
 type: 'Task',
 origin: task.origin,
 parentId: task.parent_task_id ?? null,
 },
 });

 const style = {
 opacity: isDragging ? 0.4 : 1,
 position: 'relative' as const,
 };

 return (
 <div
 ref={setNodeRef}
 style={style}
 className={cn(
 'transition-shadow duration-200',
 isDragging && 'shadow-xl rounded-xl z-50'
 )}
 >
 <ErrorBoundary
 FallbackComponent={(props) => <ErrorFallback error={props.error instanceof Error ? props.error : new Error(String(props.error))} resetErrorBoundary={props.resetErrorBoundary} />}
 onReset={() => window.location.reload()}
 >
 <TaskItem
 task={task}
 level={level}
 dragHandleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef }}
 {...props}
 />
 </ErrorBoundary>
 </div>
 );
};

TaskItem.displayName = '@/features/tasks/components/TaskItem';

export default TaskItem;
