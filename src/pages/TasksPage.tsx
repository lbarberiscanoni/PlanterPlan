import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCorners, useSensor, useSensors, PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskRow, TaskUpdate, Project } from '@/shared/db/app.types';
import { planter } from '@/shared/api/planterClient';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import TaskItem from '@/features/tasks/components/TaskItem';
import TaskDetailsPanel from '@/features/tasks/components/TaskDetailsPanel';
import { Loader2, List, LayoutGrid, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import ProjectBoardView from '@/features/tasks/components/board/ProjectBoardView';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useTeam } from '@/features/people/hooks/useTeam';
import { ROLES } from '@/shared/constants';
import { useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { toast } from 'sonner';
import {
       useTaskFilters,
       type DueDateRange,
       type TaskFilterKey,
       type TaskSortKey,
} from '@/features/tasks/hooks/useTaskFilters';
import {
       Select,
       SelectContent,
       SelectItem,
       SelectTrigger,
       SelectValue,
} from '@/shared/ui/select';

const FILTER_KEYS: TaskFilterKey[] = [
       'my_tasks', 'priority', 'overdue', 'due_soon', 'current', 'not_yet_due', 'completed', 'all_tasks', 'milestones',
];

export default function TasksPage() {
       const { t } = useTranslation();
       const queryClient = useQueryClient();
       const { data: tasks = [], isLoading: loading, isError, error, refetch } = useQuery({
              queryKey: ['tasks'],
              queryFn: () => planter.entities.Task.list(),
              staleTime: STALE_TIMES.medium,
       });
       const deleteTask = useDeleteTask();
       const confirm = useConfirm();

       const findTask = useCallback((id: string) => tasks.find((t: TaskRow) => t.id === id), [tasks]);
       const invalidateTasks = useCallback(() => queryClient.invalidateQueries({ queryKey: ['tasks'] }), [queryClient]);

       const [viewMode, setViewMode] = useState('list');
       const [filter, setFilter] = useState<TaskFilterKey>('my_tasks');
       const [sort, setSort] = useState<TaskSortKey>('chronological');
       const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
       const [dueStart, setDueStart] = useState<string>('');
       const [dueEnd, setDueEnd] = useState<string>('');
       const dueDateRange = useMemo<DueDateRange>(
              () => ({ start: dueStart || null, end: dueEnd || null }),
              [dueStart, dueEnd],
       );
       const hasDueRange = dueDateRange.start !== null || dueDateRange.end !== null;
       const clearDueRange = useCallback(() => {
              setDueStart('');
              setDueEnd('');
       }, []);

       const updateTask = useCallback(
              async (taskId: string, updates: Record<string, unknown>) => {
                     try {
                            const task = findTask(taskId);
                            const oldParentId = task ? task.parent_task_id : null;

                            await planter.entities.Task.update(taskId, updates as TaskUpdate);
                            await invalidateTasks();

                            if (task && task.origin === 'instance') {
                                   const parentUpdates = new Set<string>();
                                   if ((updates.start_date !== undefined || updates.due_date !== undefined) && task.parent_task_id) {
                                          parentUpdates.add(task.parent_task_id);
                                   }
                                   if (updates.parent_task_id !== undefined && updates.parent_task_id !== oldParentId) {
                                          if (oldParentId) parentUpdates.add(oldParentId);
                                          if (updates.parent_task_id) parentUpdates.add(updates.parent_task_id as string);
                                   }
                                   for (const pId of parentUpdates) {
                                          await planter.entities.Task.updateParentDates(pId);
                                   }
                                   await invalidateTasks();
                            }
                     } catch (error) {
                            console.error('Error updating task:', error);
                            throw error;
                     }
              },
              [findTask, invalidateTasks]
       );

       const handleStatusChange = useCallback((id: string, status: string) => {
              updateTask(id, { status });
       }, [updateTask]);
       const handleNoop = useCallback(() => { }, []);
       const handleTaskClick = useCallback((task: TaskRow) => {
              setSelectedTask(task);
       }, []);
       const closeDetailsPanel = useCallback(() => {
              setSelectedTask(null);
       }, []);
       const selectedTaskId = selectedTask?.id ?? null;
       const handleDeleteTaskById = useCallback(
              async (taskId: string) => {
                     const task = findTask(taskId);
                     if (!task) return;
                     const confirmed = await confirm({
                            title: t('tasks.delete_confirm_title', { title: task.title }),
                            description: t('tasks.delete_confirm_description'),
                            confirmText: t('common.delete'),
                            destructive: true,
                     });
                     if (!confirmed) return;

                     try {
                            await deleteTask.mutateAsync({ id: task.id, root_id: task.root_id });
                            await invalidateTasks();
                            setSelectedTask((current) => current?.id === task.id ? null : current);
                            toast.success(t('tasks.delete_success'));
                     } catch (err) {
                            console.error('Failed to delete task:', err);
                            toast.error(t('tasks.delete_failure'));
                     }
              },
              [confirm, deleteTask, findTask, invalidateTasks, t],
       );

       // Wave 33 + 36: resolve the caller's membership role for the selected
       // task's parent project. Threads into TaskDetailsPanel so the Wave 36
       // template-origin delete guard can distinguish owners from everyone
       // else. Mirror the logic in Project.tsx: creator → OWNER override if
       // no membership row exists.
       const { user } = useAuth();
       const currentUserId = user?.id ?? null;
       const currentSelectedTask = useMemo(
              () => selectedTaskId ? (tasks.find((t: TaskRow) => t.id === selectedTaskId) ?? selectedTask) : null,
              [selectedTaskId, selectedTask, tasks],
       );
       const selectedRootId = currentSelectedTask?.root_id ?? currentSelectedTask?.id ?? null;
       const selectedProjectTasks = useMemo(
              () => selectedRootId
                     ? tasks.filter((task: TaskRow) => task.root_id === selectedRootId || task.id === selectedRootId)
                     : [],
              [selectedRootId, tasks],
       );
       const selectedTaskForPanel = useMemo(() => {
              if (!currentSelectedTask) return null;

              const childrenByParent = new Map<string, TaskRow[]>();
              for (const task of selectedProjectTasks) {
                     if (!task.parent_task_id) continue;
                     const children = childrenByParent.get(task.parent_task_id) ?? [];
                     children.push(task);
                     childrenByParent.set(task.parent_task_id, children);
              }

              const attachChildren = (task: TaskRow, visited: Set<string>): TaskRow & { children: TaskRow[] } => {
                     if (visited.has(task.id)) return { ...task, children: [] };
                     visited.add(task.id);
                     const children = (childrenByParent.get(task.id) ?? [])
                            .filter((child) => child.id !== task.id)
                            .sort((a, b) => (a.position || 0) - (b.position || 0))
                            .map((child) => attachChildren(child, visited));
                     return { ...task, children };
              };

              return attachChildren(currentSelectedTask, new Set<string>());
       }, [currentSelectedTask, selectedProjectTasks]);
       const { teamMembers: selectedTeamMembers } = useTeam(selectedRootId);
       const selectedProjectRoot = tasks.find((t: TaskRow) => t.id === selectedRootId);
       const selectedMembershipRole = useMemo(() => {
              if (!currentSelectedTask) return undefined;
              const row = selectedTeamMembers.find((m) => m.user_id === currentUserId);
              if (row?.role) return row.role;
              if (selectedProjectRoot?.creator && currentUserId && selectedProjectRoot.creator === currentUserId) {
                     return ROLES.OWNER;
              }
              return undefined;
       }, [currentSelectedTask, selectedTeamMembers, selectedProjectRoot, currentUserId]);

       const visibleTasks = useTaskFilters({ tasks, filter, sort, dueDateRange, currentUserId });

       // Wave 33: map of root-task-id → project title, used to reveal each task's
       // parent-project name in a hover tooltip on the row. Projects live in the
       // same `tasks` list (roots have `parent_task_id === null`).
       const projectTitleByRootId = useMemo(() => {
              const map = new Map<string, string>();
              for (const t of tasks) {
                     if (t.parent_task_id === null && typeof t.title === 'string') {
                            map.set(t.id, t.title);
                     }
              }
              return map;
       }, [tasks]);

       const sensors = useSensors(
              useSensor(PointerSensor, {
                     activationConstraint: {
                            distance: 5,
                     },
              }),
              useSensor(KeyboardSensor, {
                     coordinateGetter: sortableKeyboardCoordinates,
              })
       );

       const handleDragEnd = (event: DragEndEvent) => {
              const { active, over } = event;

              if (!over) return;

              const activeId = active.id;
              const overData = over.data.current;

              if (overData && overData.status) {
                     const newStatus = overData.status;
                     const task = findTask(activeId as string);

                     if (task && task.status !== newStatus) {
                            updateTask(activeId as string, { status: newStatus });
                     }
              }
       };

       if (loading) {
              return (
                     <div className="flex justify-center py-20">
                            <Loader2 data-testid="loading-spinner" className="w-8 h-8 animate-spin text-orange-500" />
                     </div>
              );
       }

       // Error branch (previously silently swallowed — page looked like a
       // successful empty account). Differentiate between "you have no tasks"
       // and "the query failed" so users with broken access can retry.
       if (isError) {
              return (
                     <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
                            <p className="text-destructive font-medium">{t('errors.failed_load_tasks')}</p>
                            <p className="text-muted-foreground text-sm max-w-md">
                                   {(error as Error)?.message ?? t('errors.unknown')}
                            </p>
                            <Button variant="outline" onClick={() => refetch()}>
                                   {t('common.retry')}
                            </Button>
                     </div>
              );
       }

       return (
              <>
                     <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragEnd={handleDragEnd}
                     >
                            <div className="flex-1 flex flex-col min-w-0 bg-background h-full overflow-hidden">
                                   <div className="flex-none max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
                                          <div className="flex flex-col gap-6 mb-8 md:flex-row md:items-end md:justify-between">
                                                 <div>
                                                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t(`tasks.filters.labels.${filter}`)}</h1>
                                                        <p className="text-muted-foreground mt-1">{t('tasks.page_subtitle')}</p>
                                                 </div>

                                                 <div className="flex flex-wrap items-center gap-3">
                                                        <div className="flex flex-col gap-1">
                                                               <label htmlFor="task-filter" className="text-xs font-medium text-muted-foreground">{t('tasks.view_label')}</label>
                                                               <Select value={filter} onValueChange={(v) => setFilter(v as TaskFilterKey)}>
                                                                      <SelectTrigger id="task-filter" className="w-[180px] bg-card" aria-label={t('tasks.view_aria')}>
                                                                             <SelectValue />
                                                                      </SelectTrigger>
                                                                      <SelectContent>
                                                                             {FILTER_KEYS.map((key) => (
                                                                                    <SelectItem key={key} value={key}>{t(`tasks.filters.labels.${key}`)}</SelectItem>
                                                                             ))}
                                                                      </SelectContent>
                                                               </Select>
                                                        </div>

                                                        <div className="flex flex-col gap-1">
                                                               <label htmlFor="task-sort" className="text-xs font-medium text-muted-foreground">{t('tasks.sort_label')}</label>
                                                               <Select value={sort} onValueChange={(v) => setSort(v as TaskSortKey)}>
                                                                      <SelectTrigger id="task-sort" className="w-[180px] bg-card" aria-label={t('tasks.sort_aria')}>
                                                                             <SelectValue />
                                                                      </SelectTrigger>
                                                                      <SelectContent>
                                                                             <SelectItem value="chronological">{t('tasks.sort_chronological')}</SelectItem>
                                                                             <SelectItem value="alphabetical">{t('tasks.sort_alphabetical')}</SelectItem>
                                                                      </SelectContent>
                                                               </Select>
                                                        </div>

                                                        <div className="flex flex-col gap-1">
                                                               <span className="text-xs font-medium text-muted-foreground">
                                                                      {t('tasks.filters.dateRange.label')}
                                                               </span>
                                                               <div className="flex items-center gap-2">
                                                                      <input
                                                                             type="date"
                                                                             value={dueStart}
                                                                             onChange={(e) => setDueStart(e.target.value)}
                                                                             aria-label={t('tasks.filters.dateRange.start_aria')}
                                                                             className="h-10 rounded-md border border-input bg-card px-2 text-sm"
                                                                             data-testid="tasks-due-range-start"
                                                                      />
                                                                      <span className="text-muted-foreground text-sm">–</span>
                                                                      <input
                                                                             type="date"
                                                                             value={dueEnd}
                                                                             onChange={(e) => setDueEnd(e.target.value)}
                                                                             aria-label={t('tasks.filters.dateRange.end_aria')}
                                                                             className="h-10 rounded-md border border-input bg-card px-2 text-sm"
                                                                             data-testid="tasks-due-range-end"
                                                                      />
                                                                      {hasDueRange && (
                                                                             <button
                                                                                    type="button"
                                                                                    onClick={clearDueRange}
                                                                                    className="h-10 w-10 flex items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:text-card-foreground"
                                                                                    aria-label={t('tasks.filters.dateRange.clear')}
                                                                                    data-testid="tasks-due-range-clear"
                                                                             >
                                                                                    <X className="w-4 h-4" />
                                                                             </button>
                                                                      )}
                                                               </div>
                                                        </div>

                                                        <div className="bg-muted p-1 rounded-lg flex items-center space-x-1 self-end">
                                                               <button
                                                                      onClick={() => setViewMode('list')}
                                                                      className={`p-2 rounded-md transition-all ${viewMode === 'list'
                                                                             ? 'bg-card shadow text-card-foreground'
                                                                             : 'text-muted-foreground hover:text-card-foreground'
                                                                             }`}
                                                                      aria-label={t('tasks.view_list')}
                                                               >
                                                                      <List className="w-4 h-4" />
                                                               </button>
                                                               <button
                                                                      onClick={() => setViewMode('board')}
                                                                      className={`p-2 rounded-md transition-all ${viewMode === 'board'
                                                                             ? 'bg-card shadow text-card-foreground'
                                                                             : 'text-muted-foreground hover:text-card-foreground'
                                                                             }`}
                                                                      aria-label={t('tasks.view_board')}
                                                               >
                                                                      <LayoutGrid className="w-4 h-4" />
                                                               </button>
                                                        </div>
                                                 </div>
                                          </div>
                                   </div>

                                   <div className="flex-1 overflow-hidden">
                                          <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full">
                                                 {visibleTasks.length === 0 ? (
                                                        <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
                                                               <p className="text-muted-foreground">{t(`tasks.filters.empty.${filter}`)}</p>
                                                        </div>
                                                 ) : (
                                                        viewMode === 'list' ? (
                                                               <div className="space-y-6 overflow-y-auto h-full pb-20">
                                                                      <div className="flex flex-col gap-2">
                                                                             {visibleTasks.map(task => {
                                                                                    const projectTitle = task.root_id && task.root_id !== task.id
                                                                                           ? projectTitleByRootId.get(task.root_id) ?? null
                                                                                           : null;
                                                                                    return (
                                                                                           <TaskItem
                                                                                                  key={task.id}
                                                                                                  task={task}
                                                                                                  level={0}
                                                                                                  onStatusChange={handleStatusChange}
                                                                                                  hideExpansion={true}
                                                                                                  disableDrag={true}
                                                                                                  onTaskClick={handleTaskClick}
                                                                                                  onAddChildTask={handleNoop}
                                                                                                  onInviteMember={handleNoop}
                                                                                                  selectedTaskId={selectedTaskId}
                                                                                                  parentProjectTitle={projectTitle}
                                                                                           />
                                                                                    );
                                                                             })}
                                                                      </div>
                                                               </div>
                                                        ) : (
                                                               <div className="h-full">
                                                                      <ProjectBoardView
                                                                             project={{ id: 'my-tasks-root' } as Project}
                                                                             childrenTasks={visibleTasks}
                                                                             handleTaskClick={handleTaskClick}
                                                                      />
                                                               </div>
                                                        )
                                                 )}
                                          </div>
                                   </div>
                            </div>
                     </DndContext>

                     {selectedTaskForPanel && (
                            <TaskDetailsPanel
                                   showForm={false}
                                   selectedTask={selectedTaskForPanel}
                                   allProjectTasks={selectedProjectTasks}
                                   membershipRole={selectedMembershipRole}
                                   onClose={closeDetailsPanel}
                                   onDeleteTaskWrapper={handleDeleteTaskById}
                            />
                     )}
              </>
       );
}
