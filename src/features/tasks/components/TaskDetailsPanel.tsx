import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { TaskRow, TaskFormData, TeamMemberWithProfile } from '@/shared/db/app.types';
import type { TaskItemData } from '@/features/tasks/components/TaskItem';

import TaskForm from '@/features/tasks/components/TaskForm';
import TaskDetailsView from '@/features/tasks/components/TaskDetailsView';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

type TaskFormState = { mode?: 'create' | 'edit'; origin?: 'instance' | 'template'; isPhase?: boolean } | null;

const getPanelTitle = (
 t: TFunction,
 taskFormState?: TaskFormState,
 taskBeingEdited?: TaskRow,
 selectedTask?: TaskRow,
 parentTaskForForm?: TaskRow
) => {
 if (taskFormState) {
 if (taskFormState.mode === 'edit') {
 return taskBeingEdited
 ? t('tasks.panel.edit_named_task', { title: taskBeingEdited.title })
 : t('tasks.panel.edit_task');
 }
 const itemLabel = taskFormState.isPhase ? t('tasks.panel.phase') : t('tasks.panel.task');
 if (taskFormState.origin === 'template') {
 return parentTaskForForm
 ? t('tasks.panel.new_template_item_in_parent', { item: itemLabel, title: parentTaskForForm.title })
 : t('tasks.panel.new_template_item', { item: itemLabel });
 }
 return parentTaskForForm
 ? t('tasks.panel.new_item_in_parent', { item: itemLabel, title: parentTaskForForm.title })
 : t('tasks.panel.new_item', { item: itemLabel });
 }
 if (selectedTask) return selectedTask.title;
 return t('tasks.panel.details');
};

export interface TaskDetailsPanelProps {
 showForm: boolean;
 taskFormState?: TaskFormState;
 selectedTask?: TaskRow;
 taskBeingEdited?: TaskRow;
 parentTaskForForm?: TaskRow;
 onClose: () => void;
 renderNewProjectForm?: () => React.ReactNode;
 renderLibrarySearch?: (onSelect: (task: Partial<TaskRow>) => void) => React.ReactNode;
 handleTaskSubmit?: (data: TaskFormData) => Promise<void>;
 setTaskFormState?: (state: TaskFormState) => void;
 handleAddChildTask?: (task: TaskItemData) => void;
 handleEditTask?: (task: TaskItemData) => void;
 onDeleteTaskWrapper?: (taskId: string) => Promise<void>;
 fetchTasks?: () => void;
 membershipRole?: string;
 canEdit?: boolean;
 allProjectTasks?: TaskRow[];
 teamMembers?: TeamMemberWithProfile[];
 showComments?: boolean;
 className?: string;
}

export default function TaskDetailsPanel({
 showForm,
 taskFormState,
 selectedTask,
 taskBeingEdited,
 parentTaskForForm,
 onClose,
 renderNewProjectForm,
 renderLibrarySearch,
 handleTaskSubmit,
 setTaskFormState,
 handleAddChildTask,
 handleEditTask,
 onDeleteTaskWrapper,
 fetchTasks,
 membershipRole,
 canEdit = true,
 allProjectTasks,
 teamMembers = [],
 showComments = true,
 className,
}: TaskDetailsPanelProps) {
 const { t } = useTranslation();
 const panelTitle = useMemo(() => {
 return getPanelTitle(t, taskFormState, taskBeingEdited, selectedTask, parentTaskForForm);
 }, [t, taskFormState, taskBeingEdited, parentTaskForForm, selectedTask]);

 const isTaskFormOpen = Boolean(taskFormState);

 const projectId = selectedTask?.root_id ?? selectedTask?.id ?? null;

 return (
 <aside
 data-testid="task-details-panel"
 className={cn(
 'w-full sm:w-1/3 sm:min-w-80 sm:max-w-md bg-white border-l border-slate-200 flex flex-col shadow-2xl z-30 h-full overflow-hidden transition-all duration-300',
 className,
 )}
 >
 <div className="pt-8 px-6 pb-6 border-b border-slate-100 flex justify-between items-start bg-white sticky top-0 z-20">
 <h2 className="font-bold text-xl text-slate-800 truncate pr-4" title={panelTitle}>{panelTitle}</h2>
 <button
 onClick={onClose}
 className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20"
 aria-label={t('tasks.panel.close_panel')}
 >
 <X className="w-6 h-6" />
 </button>
 </div>
 <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white ">
 {showForm && renderNewProjectForm ? (
 renderNewProjectForm()
 ) : isTaskFormOpen && setTaskFormState ? (
 <TaskForm
 parentTask={parentTaskForForm}
 initialTask={taskBeingEdited}
 origin={taskFormState?.origin}
 renderLibrarySearch={taskFormState?.mode !== 'edit' ? renderLibrarySearch : undefined}
 submitLabel={taskFormState?.mode === 'edit'
 ? t('common.save_changes')
 : (taskFormState?.isPhase ? t('tasks.panel.add_phase') : t('tasks.panel.add_task'))}
 onSubmit={handleTaskSubmit || (async () => {})}
 onCancel={() => setTaskFormState(null)}
 membershipRole={membershipRole}
 projectId={projectId}
 teamMembers={teamMembers}
 />
 ) : selectedTask ? (
 <TaskDetailsView
 task={selectedTask as TaskItemData}
 onAddChildTask={handleAddChildTask}
 onEditTask={handleEditTask}
 onDeleteTask={onDeleteTaskWrapper ? ((t) => { void onDeleteTaskWrapper(t.id); }) : undefined}
 onTaskUpdated={fetchTasks || (() => { })}
 canEdit={canEdit}
 membershipRole={membershipRole}
 allProjectTasks={allProjectTasks}
 teamMembers={teamMembers}
 showComments={showComments}
 />
 ) : null}
 </div>
 </aside>
 );
}
