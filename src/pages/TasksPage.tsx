import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCorners, useSensor, useSensors, PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskRow, TaskUpdate, TaskFormData } from '@/shared/db/app.types';
import { constructUpdatePayload } from '@/shared/lib/date-engine/payloadHelpers';
import { planter } from '@/shared/api/planterClient';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import TaskItem from '@/features/tasks/components/TaskItem';
import TaskDetailsPanel from '@/features/tasks/components/TaskDetailsPanel';
import { FileText, LayoutList, List, Loader2, Plus, Search, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useAuth } from '@/shared/contexts/auth-context';
import { useTeam } from '@/features/people/hooks/useTeam';
import { ROLES } from '@/shared/constants';
import { useDeleteTask, useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { useConfirm } from '@/shared/ui/confirm-dialog-context';
import { toast } from 'sonner';
import {
       useTaskFilters,
       type TaskFilterKey,
       type TaskSortKey,
} from '@/features/tasks/hooks/useTaskFilters';
import { buildMilestoneTaskGroups, buildPriorityTaskGroups } from '@/features/tasks/lib/priority-tasks';
import { computeProjectTaskOrder } from '@/features/tasks/lib/task-numbering';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import {
       Select,
       SelectContent,
       SelectItem,
       SelectTrigger,
       SelectValue,
} from '@/shared/ui/select';
import {
       canDeleteTask as canDeleteTaskForRole,
       canEditTaskContent,
} from '@/features/tasks/lib/task-permissions';
import {
       Dialog,
       DialogContent,
       DialogDescription,
       DialogHeader,
       DialogTitle,
} from '@/shared/ui/dialog';

const FILTER_KEYS: TaskFilterKey[] = [
       'my_tasks', 'priority', 'overdue', 'due_soon', 'current', 'not_yet_due', 'completed', 'all_tasks', 'milestones',
];

// Sentinel for the "all projects" option in the project-scope selector — Radix
// Select items can't carry an empty-string value, so map it to/from null.
const ALL_PROJECTS = '__all__';

export default function TasksPage() {
       const { t } = useTranslation();
       const queryClient = useQueryClient();
       const { data: tasks = [], isLoading: loading, isError, error, refetch } = useQuery({
              queryKey: ['tasks'],
              queryFn: () => planter.entities.Task.list(),
              staleTime: STALE_TIMES.medium,
       });
       const deleteTask = useDeleteTask();
       const updateTaskMutation = useUpdateTask();
       const confirm = useConfirm();
       const [searchParams, setSearchParams] = useSearchParams();

       const findTask = useCallback((id: string) => tasks.find((t: TaskRow) => t.id === id), [tasks]);
       const invalidateTasks = useCallback(() => queryClient.invalidateQueries({ queryKey: ['tasks'] }), [queryClient]);

       // Default to the "Today's Tasks" view (internal key `priority`) — the
       // day-to-day landing view planters asked for, not the full backlog.
       const [filter, setFilter] = useState<TaskFilterKey>('priority');
       const [groupMode, setGroupMode] = useState<'grouped' | 'flat'>('grouped');
       const [sort, setSort] = useState<TaskSortKey>('chronological');
       const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
       // Wave 37: clicking a row opens the task's edit form directly (not the
       // read-only view), with a shareable `?task=<id>` deep-link that reopens
       // it in edit mode.
       const [taskFormState, setTaskFormState] = useState<
              { mode?: 'create' | 'edit'; origin?: 'instance' | 'template'; isPhase?: boolean } | null
       >(null);
       const handledDeepLinkRef = useRef<string | null>(null);
       const [searchQuery, setSearchQuery] = useState<string>('');
       // `undefined` = the user hasn't touched the project-scope selector yet, so
       // the page defaults to their current project (see effectiveProjectScopeId).
       // Once they pick a project the value is its id; "All projects" sets it null.
       const [selectedProjectId, setSelectedProjectId] = useState<string | null | undefined>(undefined);
       const effectiveSort: TaskSortKey = filter === 'priority' ? 'chronological' : sort;
       // The Milestones view is a high-level overview: milestones only, never
       // grouped under their parent phase as leaf rows. Force the flat layout so
       // each milestone shows as its own top-level entry.
       const isMilestonesOverview = filter === 'milestones';

       const updateTask = useCallback(
              async (taskId: string, updates: Record<string, unknown>) => {
                     try {
                            const keys = Object.keys(updates);
                            const statusUpdate = updates.status;

                            if (keys.length === 1 && typeof statusUpdate === 'string') {
                                   const { error } = await planter.entities.Task.updateStatus(taskId, statusUpdate);
                                   if (error) throw error;
                            } else {
                                   await planter.entities.Task.update(taskId, updates as TaskUpdate);
                            }
                            // Parent date roll-up (envelope) is handled DB-side by
                            // trg_envelope_rollup; just refetch.
                            await invalidateTasks();
                     } catch (error) {
                            console.error('Error updating task:', error);
                            throw error;
                     }
              },
              [invalidateTasks]
       );

       const handleStatusChange = useCallback((id: string, status: string) => {
              updateTask(id, { status });
       }, [updateTask]);
       const openTaskInEditMode = useCallback((task: TaskRow) => {
              setSelectedTask(task);
              setTaskFormState({ mode: 'edit', origin: (task.origin as 'instance' | 'template') ?? 'instance' });
       }, []);
       const handleTaskClick = useCallback((task: TaskRow) => {
              openTaskInEditMode(task);
              const next = new URLSearchParams(searchParams);
              next.set('task', task.id);
              setSearchParams(next, { replace: false });
       }, [openTaskInEditMode, searchParams, setSearchParams]);
       const closeDetailsPanel = useCallback(() => {
              setSelectedTask(null);
              setTaskFormState(null);
              if (searchParams.has('task')) {
                     const next = new URLSearchParams(searchParams);
                     next.delete('task');
                     setSearchParams(next, { replace: true });
              }
       }, [searchParams, setSearchParams]);
       // Deep-link: when the URL carries `?task=<id>`, open that task in edit
       // mode once its row is present in the loaded list.
       const deepLinkTaskId = searchParams.get('task');
       useEffect(() => {
              if (!deepLinkTaskId) {
                     handledDeepLinkRef.current = null;
                     return;
              }
              if (handledDeepLinkRef.current === deepLinkTaskId) return;
              const target = tasks.find((tk: TaskRow) => tk.id === deepLinkTaskId);
              if (!target) return;
              handledDeepLinkRef.current = deepLinkTaskId;
              openTaskInEditMode(target);
       }, [deepLinkTaskId, tasks, openTaskInEditMode]);
       const selectedTaskId = selectedTask?.id ?? null;
       const handleTaskSubmit = useCallback(async (formData: TaskFormData) => {
              if (!selectedTask) return;
              try {
                     const updatePayload = constructUpdatePayload(formData, selectedTask, {
                            origin: selectedTask.origin ?? 'instance',
                            parentId: selectedTask.parent_task_id ?? null,
                            rootId: selectedTask.root_id ?? null,
                            contextTasks: tasks as TaskRow[],
                     });
                     await updateTaskMutation.mutateAsync({
                            id: selectedTask.id,
                            ...updatePayload,
                            root_id: selectedTask.root_id ?? selectedTask.id,
                     });
                     await invalidateTasks();
                     setTaskFormState(null);
                     toast.success(t('projects.task_updated_toast'));
              } catch (err) {
                     const message = err instanceof Error ? err.message : t('errors.unknown');
                     toast.error(t('projects.task_save_failed_toast'), { description: message });
                     throw err;
              }
       }, [selectedTask, tasks, updateTaskMutation, invalidateTasks, t]);
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
                            setTaskFormState(null);
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
                     return ROLES.PLANTER;
              }
              return undefined;
       }, [currentSelectedTask, selectedTeamMembers, selectedProjectRoot, currentUserId]);
       const selectedCanEdit = canEditTaskContent(selectedMembershipRole);
       const selectedCanDelete = selectedTaskForPanel
              ? canDeleteTaskForRole(selectedMembershipRole, selectedTaskForPanel)
              : false;

       // Complete list of the caller's project roots (id + title). The main
       // `['tasks']` list (Task.list) is row-capped, so for accounts with many
       // tasks some project roots fall outside it — leaving the grouped view's
       // milestone/phase headers without a project label. This small, uncapped
       // roots query (shared cache with the sidebar) makes project attribution
       // reliable regardless of total task count.
       const { data: projectRoots = [] } = useQuery({
              queryKey: ['projects'],
              queryFn: () => planter.entities.Project.list(),
              staleTime: STALE_TIMES.medium,
       });

       // Map of root-task-id → project title. Built from the authoritative roots
       // query first, with the `tasks` list as a fallback. Used both for the
       // per-row hover tooltip and to label each grouped section by its project.
       const projectTitleByRootId = useMemo(() => {
              const map = new Map<string, string>();
              for (const t of tasks) {
                     if (t.parent_task_id === null && typeof t.title === 'string') {
                            map.set(t.id, t.title);
                     }
              }
              for (const root of projectRoots) {
                     if (typeof root.title === 'string') {
                            map.set(root.id, root.title);
                     }
              }
              return map;
       }, [tasks, projectRoots]);
       // Project options for the scope selector, sorted by title. Built from the
       // same root-id → title map so it stays consistent with group labels.
       const projectOptions = useMemo(
              () => Array.from(projectTitleByRootId.entries())
                     .map(([id, title]) => ({ id, title }))
                     .sort((a, b) => a.title.localeCompare(b.title)),
              [projectTitleByRootId],
       );
       // Default the page to the user's current project (persisted choice, else
       // their first project) so /tasks opens scoped to what they're working on —
       // with "All projects" always one click away. Only instance roots are
       // switchable targets; templates/joined labels also live in projectOptions
       // but resolving to one of them is harmless (it just scopes to that root).
       const { currentProjectId } = useCurrentProject(projectOptions);
       const effectiveProjectScopeId = selectedProjectId === undefined ? currentProjectId : selectedProjectId;
       const actionableTaskCount = useMemo(
              () => tasks.filter((task) => task.origin === 'instance' && task.parent_task_id !== null).length,
              [tasks],
       );
       const instanceProjectCount = useMemo(
              () => tasks.filter((task) => task.origin === 'instance' && task.parent_task_id === null).length,
              [tasks],
       );
       const filteredTasks = useTaskFilters({
              tasks,
              filter,
              sort: effectiveSort,
              currentUserId,
              projectScopeId: filter === 'my_tasks' ? null : effectiveProjectScopeId,
       });
       const normalizedSearchQuery = searchQuery.trim().toLowerCase();
       const visibleTasks = useMemo(() => {
              if (!normalizedSearchQuery) return filteredTasks;

              return filteredTasks.filter((task) => {
                     const projectTitle = task.root_id ? projectTitleByRootId.get(task.root_id) : null;
                     const haystack = [
                            task.title,
                            task.description,
                            projectTitle,
                     ]
                            .filter((value): value is string => typeof value === 'string' && value.length > 0)
                            .join(' ')
                            .toLowerCase();
                     return haystack.includes(normalizedSearchQuery);
              });
       }, [filteredTasks, normalizedSearchQuery, projectTitleByRootId]);
       const showFirstRunEmptyState = instanceProjectCount === 0
              && actionableTaskCount === 0
              && visibleTasks.length === 0
              && filter === 'all_tasks'
              && !normalizedSearchQuery;
       const childrenByParentForStatus = useMemo(() => {
              const map = new Map<string, TaskRow[]>();
              for (const task of tasks) {
                     if (!task.parent_task_id) continue;
                     const children = map.get(task.parent_task_id) ?? [];
                     children.push(task);
                     map.set(task.parent_task_id, children);
              }
              for (const children of map.values()) {
                     children.sort((a, b) => (a.position || 0) - (b.position || 0));
              }
              return map;
       }, [tasks]);
       const withImmediateChildrenForStatus = useCallback(
              (task: TaskRow) => ({
                     ...task,
                     children: childrenByParentForStatus.get(task.id) ?? [],
              }),
              [childrenByParentForStatus],
       );
       const visibleTaskRows = useMemo(
              () => visibleTasks.map((task) => withImmediateChildrenForStatus(task)),
              [visibleTasks, withImmediateChildrenForStatus],
       );
       // Milestone-grouped layout (default). The priority filter keeps its own
       // urgency-aware builder; every other filter groups its visible rows by
       // nearest milestone. Either way the grouped set covers the same tasks as
       // the flat list, so toggling Grouped/Flat never changes which tasks show.
       const groupedSections = useMemo(
              () => {
                     if (groupMode !== 'grouped' || isMilestonesOverview) return [];
                     const groups = filter === 'priority'
                            ? buildPriorityTaskGroups({ tasks, candidateTasks: visibleTaskRows })
                            : buildMilestoneTaskGroups({
                                   tasks,
                                   candidateTasks: visibleTaskRows,
                                   // All Tasks orders rows within each milestone by serial
                                   // number; other views keep the due-date urgency order.
                                   orderIndex: filter === 'all_tasks' ? computeProjectTaskOrder(tasks) : undefined,
                            });
                     // Backfill the project label from the authoritative roots map so
                     // every section is attributed even when its root is outside the
                     // row-capped task list. All tasks in a group share one project.
                     return groups.map((group) => {
                            const rootId = group.tasks[0]?.task.root_id;
                            const projectTitle = (rootId && projectTitleByRootId.get(rootId)) || group.projectTitle;
                            return projectTitle === group.projectTitle ? group : { ...group, projectTitle };
                     });
              },
              [groupMode, filter, isMilestonesOverview, tasks, visibleTaskRows, projectTitleByRootId],
       );

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
                                                        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
                                                               {t('tasks.result_count', { shown: visibleTasks.length, total: actionableTaskCount })}
                                                        </p>
                                                 </div>

                                                 <div className="flex flex-wrap items-center gap-3">
                                                        <div className="flex flex-col gap-1">
                                                               <label htmlFor="task-search" className="text-xs font-medium text-muted-foreground">{t('tasks.search_label')}</label>
                                                               <div className="relative">
                                                                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                                                      <Input
                                                                             id="task-search"
                                                                             type="search"
                                                                             value={searchQuery}
                                                                             onChange={(event) => setSearchQuery(event.target.value)}
                                                                             placeholder={t('tasks.search_placeholder')}
                                                                             aria-label={t('tasks.search_aria')}
                                                                             className="w-56 bg-card pl-9 pr-9"
                                                                      />
                                                                      {searchQuery && (
                                                                             <button
                                                                                    type="button"
                                                                                    onClick={() => setSearchQuery('')}
                                                                                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-card-foreground"
                                                                                    aria-label={t('tasks.clear_search')}
                                                                             >
                                                                                    <X className="h-4 w-4" aria-hidden="true" />
                                                                             </button>
                                                                      )}
                                                               </div>
                                                        </div>

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

                                                        {filter !== 'my_tasks' && (
                                                               <div className="flex flex-col gap-1">
                                                                      <label htmlFor="task-project-scope" className="text-xs font-medium text-muted-foreground">{t('tasks.project_scope_label')}</label>
                                                                      <Select
                                                                             value={effectiveProjectScopeId ?? ALL_PROJECTS}
                                                                             onValueChange={(v) => setSelectedProjectId(v === ALL_PROJECTS ? null : v)}
                                                                      >
                                                                             <SelectTrigger id="task-project-scope" className="w-[200px] bg-card" aria-label={t('tasks.project_scope_aria')}>
                                                                                    <SelectValue />
                                                                             </SelectTrigger>
                                                                             <SelectContent>
                                                                                    <SelectItem value={ALL_PROJECTS}>{t('tasks.project_scope_all')}</SelectItem>
                                                                                    {projectOptions.map((p) => (
                                                                                           <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                                                                                    ))}
                                                                             </SelectContent>
                                                                      </Select>
                                                               </div>
                                                        )}

                                                        {filter !== 'priority' && (
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
                                                        )}

                                                        {!isMilestonesOverview && (
                                                        <div className="flex flex-col gap-1 self-end">
                                                               <span className="text-xs font-medium text-muted-foreground">{t('tasks.layout_label')}</span>
                                                               <div className="bg-muted p-1 rounded-lg flex items-center space-x-1">
                                                                      <button
                                                                             type="button"
                                                                             onClick={() => setGroupMode('grouped')}
                                                                             className={`p-2 rounded-md transition-all ${groupMode === 'grouped'
                                                                                    ? 'bg-card shadow text-card-foreground'
                                                                                    : 'text-muted-foreground hover:text-card-foreground'
                                                                                    }`}
                                                                             aria-label={t('tasks.layout_grouped')}
                                                                             aria-pressed={groupMode === 'grouped'}
                                                                      >
                                                                             <LayoutList className="w-4 h-4" />
                                                                      </button>
                                                                      <button
                                                                             type="button"
                                                                             onClick={() => setGroupMode('flat')}
                                                                             className={`p-2 rounded-md transition-all ${groupMode === 'flat'
                                                                                    ? 'bg-card shadow text-card-foreground'
                                                                                    : 'text-muted-foreground hover:text-card-foreground'
                                                                                    }`}
                                                                             aria-label={t('tasks.layout_flat')}
                                                                             aria-pressed={groupMode === 'flat'}
                                                                      >
                                                                             <List className="w-4 h-4" />
                                                                      </button>
                                                               </div>
                                                        </div>
                                                        )}
                                                 </div>
                                          </div>
                                   </div>

                                   <div className="flex-1 overflow-hidden">
                                          <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full">
                                                 {visibleTasks.length === 0 ? (
                                                        <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
                                                               {showFirstRunEmptyState ? (
                                                                      <div className="mx-auto flex max-w-xl flex-col items-center gap-4" data-testid="tasks-first-run-empty-state">
                                                                             <div className="space-y-2">
                                                                                    <h2 className="text-xl font-semibold text-slate-900">{t('tasks.first_run.title')}</h2>
                                                                                    <p className="text-slate-600">{t('tasks.first_run.description')}</p>
                                                                             </div>
                                                                             <div className="flex flex-col gap-3 sm:flex-row">
                                                                                    <Button asChild>
                                                                                           <Link to="/tasks?action=new-project">
                                                                                                  <Plus className="w-4 h-4" aria-hidden="true" />
                                                                                                  {t('tasks.first_run.blank_cta')}
                                                                                           </Link>
                                                                                    </Button>
                                                                                    <Button asChild variant="outline">
                                                                                           <Link to="/tasks?action=new-project&template=launch_large">
                                                                                                  <FileText className="w-4 h-4" aria-hidden="true" />
                                                                                                  {t('tasks.first_run.template_cta')}
                                                                                           </Link>
                                                                                    </Button>
                                                                             </div>
                                                                      </div>
                                                               ) : (
                                                                      <p className="text-slate-600">
                                                                             {normalizedSearchQuery
                                                                                    ? t('tasks.search_empty')
                                                                                    : t(`tasks.filters.empty.${filter}`)}
                                                                      </p>
                                                               )}
                                                        </div>
                                                 ) : (
                                                        <div className="space-y-6 overflow-y-auto h-full pb-20">
                                                                      {groupMode === 'grouped' && !isMilestonesOverview ? (
                                                                             groupedSections.map((group) => (
                                                                                    <section
                                                                                           key={group.id}
                                                                                           className="rounded-xl border border-border bg-card p-4 shadow-sm"
                                                                                           data-testid={`task-group-${group.id}`}
                                                                                    >
                                                                                           <div className="mb-3 border-b border-border pb-3">
                                                                                                  {group.projectTitle && (
                                                                                                         <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{group.projectTitle}</p>
                                                                                                  )}
                                                                                                  <h2
                                                                                                         id={`priority-group-heading-${group.id}`}
                                                                                                         className="text-base font-semibold text-card-foreground"
                                                                                                  >
                                                                                                         {group.milestone && (group.milestone.root_id ?? group.tasks[0]?.task.root_id) ? (
                                                                                                                <Link
                                                                                                                       to={`/project/${group.milestone.root_id ?? group.tasks[0]?.task.root_id}?task=${group.milestone.id}`}
                                                                                                                       className="rounded-sm underline-offset-2 outline-none hover:text-brand-600 hover:underline focus-visible:text-brand-600 focus-visible:underline"
                                                                                                                       aria-label={t('tasks.open_milestone_aria', { title: group.title })}
                                                                                                                >
                                                                                                                       {group.title}
                                                                                                                </Link>
                                                                                                         ) : (
                                                                                                                group.title
                                                                                                         )}
                                                                                                  </h2>
                                                                                           </div>
                                                                                           <div
                                                                                                  role="tree"
                                                                                                  aria-labelledby={`priority-group-heading-${group.id}`}
                                                                                                  className="flex flex-col gap-2"
                                                                                           >
                                                                                                  {group.tasks.map(({ task, displayNumber }) => (
                                                                                                         <div key={task.id} className="flex min-w-0 gap-3">
                                                                                                                <span
                                                                                                                       className="mt-5 w-10 flex-shrink-0 text-right font-mono text-xs font-semibold text-muted-foreground"
                                                                                                                       aria-hidden="true"
                                                                                                                >
                                                                                                                       {displayNumber}
                                                                                                                </span>
                                                                                                                <div className="min-w-0 flex-1">
                                                                                                                       <TaskItem
                                                                                                                              task={task}
                                                                                                                              level={0}
                                                                                                                              onStatusChange={handleStatusChange}
                                                                                                                              hideExpansion={true}
                                                                                                                              disableDrag={true}
                                                                                                                              onTaskClick={handleTaskClick}
                                                                                                                              selectedTaskId={selectedTaskId}
                                                                                                                              parentProjectTitle={group.projectTitle}
                                                                                                                       />
                                                                                                                </div>
                                                                                                         </div>
                                                                                                  ))}
                                                                                           </div>
                                                                                    </section>
                                                                             ))
                                                                      ) : (
                                                                             <div className="flex flex-col gap-2">
                                                                                    {visibleTaskRows.map(task => {
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
                                                                                                         selectedTaskId={selectedTaskId}
                                                                                                         parentProjectTitle={projectTitle}
                                                                                                  />
                                                                                           );
                                                                                    })}
                                                                             </div>
                                                                      )}
                                                        </div>
                                                 )}
                                          </div>
                                   </div>
                            </div>
                     </DndContext>

                     <Dialog
                            open={selectedTaskForPanel !== null}
                            onOpenChange={(open) => {
                                   if (!open) closeDetailsPanel();
                            }}
                     >
                            <DialogContent
                                   hideClose
                                   className="h-full max-h-screen max-w-3xl overflow-hidden p-0 sm:h-5/6"
                            >
                                   <DialogHeader className="sr-only">
                                          <DialogTitle>{selectedTaskForPanel?.title ?? t('tasks.panel.details')}</DialogTitle>
                                          <DialogDescription>{t('tasks.panel.description')}</DialogDescription>
                                   </DialogHeader>
                                   {selectedTaskForPanel && (
                                          <TaskDetailsPanel
                                                 showForm={false}
                                                 taskFormState={selectedCanEdit ? taskFormState : null}
                                                 selectedTask={selectedTaskForPanel}
                                                 taskBeingEdited={taskFormState?.mode === 'edit' ? selectedTaskForPanel : undefined}
                                                 setTaskFormState={setTaskFormState}
                                                 handleTaskSubmit={handleTaskSubmit}
                                                 allProjectTasks={selectedProjectTasks}
                                                 membershipRole={selectedMembershipRole}
                                                 teamMembers={selectedTeamMembers}
                                                 onClose={closeDetailsPanel}
                                                 canEdit={selectedCanEdit}
                                                 handleEditTask={selectedCanEdit ? ((task) => openTaskInEditMode(task as TaskRow)) : undefined}
                                                 onDeleteTaskWrapper={selectedCanDelete ? handleDeleteTaskById : undefined}
                                                 className="w-full border-l-0 shadow-none sm:w-full sm:min-w-0 sm:max-w-none"
                                          />
                                   )}
                            </DialogContent>
                     </Dialog>
              </>
       );
}
