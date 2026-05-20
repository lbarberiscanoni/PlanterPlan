import { Edit, Plus, UserPlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskRow } from '@/shared/db/app.types';

interface TaskControlButtonsProps {
 task: TaskRow;
 onEdit?: (task: TaskRow) => void;
 onAddChild?: (task: TaskRow) => void;
 onInvite?: (task: TaskRow) => void;
 onDelete?: (id: string) => void;
 canHaveChildren?: boolean;
}

/**
 * Row-level icon actions (edit / add subtask / invite / delete) on a task.
 *
 * A11y: every button carries both `aria-label` and `title` — `title` is the
 * mouse tooltip and `aria-label` is the accessible name for assistive tech.
 * Per WCAG 4.1.2 + ARIA Authoring Practices, `title` alone is insufficient
 * as the sole accessible name because SR support varies; `aria-label` is
 * the authoritative source. Inner SVG icons carry `aria-hidden="true"` so
 * they don't double-announce.
 */
export default function TaskControlButtons({
 task,
 onEdit,
 onAddChild,
 onInvite,
 onDelete,
 canHaveChildren
}: TaskControlButtonsProps) {
 const { t } = useTranslation();
 const taskTitle = task.title ?? t('common.untitled_task');

 return (
 <>
 {onEdit && (
 <button
 type="button"
 className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:text-brand-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
 onClick={(e) => { e.stopPropagation(); if (onEdit) onEdit(task); }}
 aria-label={t('tasks.edit_task_aria', { title: taskTitle })}
 title={t('tasks.edit_task')}
 >
 <Edit className="w-3.5 h-3.5" aria-hidden="true" />
 </button>
 )}

 {canHaveChildren && onAddChild && (
 <button
 type="button"
 className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:text-brand-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
 onClick={(e) => { e.stopPropagation(); if (onAddChild) onAddChild(task); }}
 aria-label={t('tasks.add_subtask_aria', { title: taskTitle })}
 title={t('tasks.add_subtask')}
 >
 <Plus className="w-3.5 h-3.5" aria-hidden="true" />
 </button>
 )}

 {onInvite && (
 <button
 type="button"
 className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:text-brand-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
 onClick={(e) => { e.stopPropagation(); if (onInvite) onInvite(task); }}
 aria-label={t('tasks.invite_member_aria', { title: taskTitle })}
 title={t('tasks.invite_member')}
 >
 <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
 </button>
 )}

 {onDelete && (
 <button
 type="button"
 className="inline-flex h-6 w-6 items-center justify-center rounded text-rose-500 hover:text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-colors"
 onClick={(e) => { e.stopPropagation(); if (onDelete) onDelete(task.id); }}
 aria-label={t('tasks.delete_task_aria', { title: taskTitle })}
 title={t('tasks.delete_task')}
 >
 <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
 </button>
 )}
 </>
 );
}
