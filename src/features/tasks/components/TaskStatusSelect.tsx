import { useTranslation } from 'react-i18next';
import { TASK_STATUS } from '@/shared/constants';

const getStatusStyle = (status?: string | null) => {
 switch (status) {
 case TASK_STATUS.COMPLETED:
 return 'status-badge-complete';
 case TASK_STATUS.IN_PROGRESS:
 return 'status-badge-progress';
 case TASK_STATUS.BLOCKED:
 return 'status-badge-blocked';
 case TASK_STATUS.TODO:
 default:
 return 'status-badge-todo';
 }
};

interface TaskStatusSelectProps {
  status?: string | null;
  taskId: string;
  /** Task title — required for a per-row accessible name. Falls back to a
   *  generic "Task status" label if omitted for legacy callers. */
  taskTitle?: string | null;
  onStatusChange?: (taskId: string, status: string) => void;
  disabled?: boolean;
}

/**
 * Pill-shaped status dropdown rendered on every task row. Each row shows the
 * same four options, so without a task-scoped accessible name a screen reader
 * user hearing "combobox, To Do" has no way to tell which task they're on. We
 * use `aria-label` (rather than a visible label) because the pill styling is
 * the design language — a floating visible label would clutter the row.
 */
export default function TaskStatusSelect({ status, taskId, taskTitle, onStatusChange, disabled = false }: TaskStatusSelectProps) {
  const { t } = useTranslation();
  const label = taskTitle
    ? t('tasks.status_for_aria', { title: taskTitle })
    : t('tasks.status_label', { defaultValue: 'Task status' });
  return (
    <div data-testid="status-select" className="relative group">
      <select
        aria-label={label}
        className={`appearance-none pl-4 pr-9 py-1.5 text-xs font-semibold rounded-full border transition-all ${getStatusStyle(status)} focus:ring-2 focus:ring-offset-1 focus:ring-brand-500 focus:outline-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        value={status || TASK_STATUS.TODO}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          if (!disabled) onStatusChange?.(taskId, e.target.value);
        }}
      >
        <option value={TASK_STATUS.TODO}>To Do</option>
        <option value={TASK_STATUS.IN_PROGRESS}>In Progress</option>
        <option value={TASK_STATUS.BLOCKED}>Blocked</option>
        <option value={TASK_STATUS.COMPLETED}>Complete</option>
      </select>
    </div>
  );
}
