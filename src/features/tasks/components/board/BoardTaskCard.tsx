import { memo, type KeyboardEvent } from 'react';
import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Calendar, Link as LinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RoleIndicator from '@/shared/ui/RoleIndicator';
import { formatDate, isPastDate, isTodayDate, isDateValid } from '@/shared/lib/date-engine';


/**
 * Format a due date for display
 */
const formatDueDate = (dateString?: string | null) => {
 if (!dateString) return null;
 try {
 if (!isDateValid(dateString)) return null;
 return formatDate(dateString, 'MMM d');
 } catch {
 return null;
 }
};

/**
 * Get date color based on urgency
 */
const getDateColor = (dateString?: string | null) => {
 if (!dateString) return 'text-slate-400';
 try {
 if (!isDateValid(dateString)) return 'text-slate-400';
 if (isPastDate(dateString)) return 'text-rose-600';
 if (isTodayDate(dateString)) return 'text-amber-600';
 return 'text-slate-500';
 } catch {
 return 'text-slate-400';
 }
};

import type { TaskItemData } from '@/features/tasks/components/TaskItem';

export interface BoardTaskCardData extends TaskItemData {
 breadcrumbs?: string;
}

interface BoardTaskCardProps {
 task: BoardTaskCardData;
 onClick: (task: BoardTaskCardData) => void;
 dragHandleProps?: Record<string, unknown>;
 style?: CSSProperties;
 isDragging?: boolean;
}

const BoardTaskCard = memo(({ task, onClick, dragHandleProps, style, isDragging }: BoardTaskCardProps) => {
 const { t } = useTranslation();
 const formattedDate = formatDueDate(task.due_date);
 const dateColor = getDateColor(task.due_date);

 // Keyboard activation: `role="button"` + Enter/Space is the WAI-ARIA
 // pattern for making a div-shaped card act like a button. Previously the
 // card was `<div onClick>` — unreachable from the keyboard, so the entire
 // board view was keyboard-unusable (can't open task details). Can't use a
 // real `<button>` here because the card contains nested interactive
 // elements (the drag handle), which is invalid HTML inside a button.
 //
 // Guard: only handle the key when the card itself has focus. Otherwise a
 // Space/Enter on the nested drag-handle button (for dnd-kit's keyboard
 // sensor "pick up item" gesture) would bubble into this handler and
 // hijack the event — opening the details panel mid-drag.
 const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
 if (e.target !== e.currentTarget) return;
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 onClick(task);
 }
 };

 return (
 <div
 data-testid="board-task-card"
 role="button"
 tabIndex={0}
 aria-label={t('tasks.open_task_details_aria', { title: task.title ?? t('common.untitled_task') })}
 className={`bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${isDragging ? 'opacity-50 ring-2 ring-brand-500' : ''}`}
 style={style}
 onClick={() => onClick(task)}
 onKeyDown={handleKeyDown}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <button
 type="button"
 className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
 aria-label={t('tasks.reorder_task')}
 onClick={(e) => e.stopPropagation()}
 {...dragHandleProps}
 >
 <GripVertical className="w-4 h-4" aria-hidden="true" />
 </button>
 {task.resource_type && (
 <span className="p-1 rounded bg-brand-50 text-brand-700" aria-hidden="true">
 <LinkIcon className="w-3 h-3" />
 </span>
 )}
 </div>

 {/* Breadcrumbs - Hierarchy Context */}
 {task.breadcrumbs && (
 <div className="mb-0.5 text-xs text-slate-400 font-medium truncate" title={task.breadcrumbs}>
 {task.breadcrumbs}
 </div>
 )}

 <h4 className="text-sm font-medium text-slate-800 line-clamp-3 leading-snug">
 {task.title}
 </h4>
 </div>

 {/* Flex-shrink container forces badge to remain uniform without squishing */}
 {task.membership_role && (
 <div className="flex-shrink-0 pt-0.5">
 <RoleIndicator role={task.membership_role} />
 </div>
 )}
 </div>

 {/* Footer: Subtasks + Due Date */}
 <div className="mt-2 flex items-center justify-between text-xs">
 {task.children && task.children.length > 0 ? (
 <div className="text-slate-400 flex items-center gap-1">
 <span className="font-semibold">{task.children.length}</span> subtasks
 </div>
 ) : (
 <div />
 )}
 {formattedDate && (
 <div className={`flex items-center gap-1 ${dateColor}`}>
 <Calendar className="w-3 h-3" />
 <span>{formattedDate}</span>
 </div>
 )}
 </div>
 </div>
 );
}, (prev, next) => {
 // Custom comparator: compare scalar task values instead of object references
 // to avoid re-renders from dnd-kit's new prop objects each cycle
 return (
 prev.task.id === next.task.id &&
 prev.task.title === next.task.title &&
 prev.task.status === next.task.status &&
 prev.task.due_date === next.task.due_date &&
 prev.task.updated_at === next.task.updated_at &&
 prev.task.breadcrumbs === next.task.breadcrumbs &&
 prev.task.membership_role === next.task.membership_role &&
 prev.task.children?.length === next.task.children?.length &&
 prev.isDragging === next.isDragging &&
 prev.onClick === next.onClick
 );
});

BoardTaskCard.displayName = 'BoardTaskCard';

export const SortableBoardTaskCard = memo(({ task, onClick }: { task: BoardTaskCardData, onClick: (task: BoardTaskCardData) => void }) => {
 const {
 attributes,
 listeners,
 setNodeRef,
 transform,
 transition,
 isDragging,
 } = useSortable({
 id: task.id,
 data: {
 type: 'Task',
 origin: task.origin,
 parentId: task.parent_task_id ?? null,
 status: task.status // Important for board logic
 },
 });

 const style = {
 transform: CSS.Translate.toString(transform),
 transition,
 };

 return (
 <div ref={setNodeRef} style={style} className="touch-none">
 <BoardTaskCard
 task={task}
 onClick={onClick}
 dragHandleProps={{ ...attributes, ...listeners }}
 isDragging={isDragging}
 />
 </div>
 );
}, (prev, next) => {
 // Compare scalar values — task identity + content + onClick stability
 return (
 prev.task.id === next.task.id &&
 prev.task.title === next.task.title &&
 prev.task.status === next.task.status &&
 prev.task.due_date === next.task.due_date &&
 prev.task.updated_at === next.task.updated_at &&
 prev.onClick === next.onClick
 );
});

SortableBoardTaskCard.displayName = 'SortableBoardTaskCard';

export default SortableBoardTaskCard;
