import { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTaskQuery } from '@/features/tasks/hooks/useTaskQuery';
import { useUpdateTask, useCreateTask, useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';
import { buildTree, collectSpawnedTemplateIds, separateTasksByOrigin } from '@/shared/lib/tree-helpers';
import type { TaskNode } from '@/shared/lib/tree-helpers';
import { Project, TaskRow, TaskFormData, TaskInsert, Json } from '@/shared/db/app.types';
import { formDataToRecurrenceRule } from '@/features/tasks/lib/recurrence-form';
import { applyCoachingFlag, formDataToCoachingFlag } from '@/features/tasks/lib/coaching-form';
import { applyStrategyTemplateFlag, formDataToStrategyTemplateFlag } from '@/features/tasks/lib/strategy-form';
import { applyPhaseLeads } from '@/features/projects/lib/phase-lead';
import React from 'react';
import { useProjectData } from '@/features/projects/hooks/useProjectData';
import ProjectSidebar from '@/features/navigation/components/ProjectSidebar';
import ProjectTasksView from './ProjectTasksView';
import DashboardLayout from '@/layouts/DashboardLayout';
import TaskDetailsPanel from '@/features/tasks/components/TaskDetailsPanel';
import MasterLibrarySearch from '@/features/library/components/MasterLibrarySearch';
import EmptyProjectState from '@/features/tasks/components/EmptyProjectState';
import StatusCard from '@/shared/ui/StatusCard';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/shared/ui/confirm-dialog';

export interface TaskFormState {
  mode: 'create' | 'edit';
  origin?: 'instance' | 'template';
  parentId?: string | null;
  taskId?: string;
}

const TaskList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();

  // --- Data Fetching ---
  const {
    tasks,
    loading,
    projectsLoading,
    joinedLoading,
    templatesLoading,
    error,
    refetchProjects,
    joinedProjects,
    findTask,
  } = useTaskQuery();

  const { mutateAsync: updateTaskAsync } = useUpdateTask();
  const { mutateAsync: createTaskAsync } = useCreateTask();
  const { mutateAsync: deleteTaskAsync } = useDeleteTask();

  const { instanceTasks, templateTasks } = useMemo(() => separateTasksByOrigin(tasks), [tasks]);

  // --- Project Selection (was useProjectSelection) ---
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const handleSelectProject = useCallback(
    async (project: { id: string }): Promise<void> => {
      setActiveProjectId(project.id);
    },
    []
  );

  useEffect(() => {
    if (urlProjectId && urlProjectId !== activeProjectId && !loading) {
      const project =
        instanceTasks.find((p) => p.id === urlProjectId) ||
        templateTasks.find((p) => p.id === urlProjectId) ||
        (joinedProjects || []).find((p: Project) => p.id === urlProjectId);

      if (project) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional URL-to-state sync
        handleSelectProject(project);
      }
    }
  }, [urlProjectId, activeProjectId, loading, instanceTasks, templateTasks, joinedProjects, handleSelectProject]);

  // --- Project Hierarchy ---
  const { projectHierarchy } = useProjectData(activeProjectId);

  const hydratedProjects = React.useMemo(() => {
    if (!activeProjectId || !projectHierarchy || projectHierarchy.length === 0) return {};
    return { [activeProjectId]: projectHierarchy };
  }, [activeProjectId, projectHierarchy]);

  // Collect every template id already cloned into the active project so the
  // Master Library combobox can hide them. Pre-Wave-22 clones lack the stamp
  // and will still appear — call that out in PRs / release notes.
  const excludedTemplateIds = React.useMemo(
    () => collectSpawnedTemplateIds(projectHierarchy),
    [projectHierarchy],
  );

  // --- Expanded Tasks (was useExpandedTasks) ---
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  const handleToggleExpand = useCallback((task: { id: string }, expanded: boolean) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
  }, []);

  // --- Task Tree (was useTaskTree) ---
  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;

    const rootProject =
      instanceTasks.find((t) => t.id === activeProjectId) ||
      templateTasks.find((t) => t.id === activeProjectId) ||
      (joinedProjects || []).find((t: Project) => t.id === activeProjectId);

    if (!rootProject) return null;

    const childrenFlat = (hydratedProjects as Record<string, TaskRow[]>)[activeProjectId];

    let childrenTree: TaskNode[] = [];
    if (childrenFlat) {
      childrenTree = buildTree(childrenFlat, activeProjectId);
    }

    const applyExpansion = (nodes: TaskNode[]): TaskNode[] => {
      return nodes.map((node) => ({
        ...node,
        isExpanded: expandedTaskIds.has(node.id),
        children: applyExpansion(node.children || []),
      }));
    };

    return {
      ...rootProject,
      children: applyExpansion(childrenTree),
      isExpanded: expandedTaskIds.has(rootProject.id),
    };
  }, [activeProjectId, instanceTasks, templateTasks, joinedProjects, hydratedProjects, expandedTaskIds]);

  // --- Board UI State (was useTaskBoardUI) ---
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [taskFormState, setTaskFormState] = useState<TaskFormState | null>(null);

  // --- Handle URL action params (e.g. ?action=new-template) ---
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'new-template') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional URL-to-state sync
      setSelectedTask(null);
      setTaskFormState({ mode: 'create', origin: 'template', parentId: null });
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleAddChildTask = useCallback((parentTask: TaskRow) => {
    setTaskFormState({
      mode: 'create',
      origin: (parentTask.origin as 'instance' | 'template') || undefined,
      parentId: parentTask.id,
    });
    setShowForm(false);
    setSelectedTask(null);
  }, []);

  const handleEditTask = useCallback((task: TaskRow) => {
    setTaskFormState({
      mode: 'edit',
      origin: (task.origin as 'instance' | 'template') || undefined,
      parentId: task.parent_task_id || null,
      taskId: task.id,
    });
    setShowForm(false);
    setSelectedTask(task);
  }, []);

  const onDeleteTaskWrapper = useCallback(
    async (task: TaskRow) => {
      const confirmed = await confirm({
        title: t('tasks.delete_confirm_title', { title: task.title }),
        description: t('tasks.delete_confirm_description'),
        confirmText: t('common.delete'),
        destructive: true,
      });
      if (!confirmed) return;

      try {
        await deleteTaskAsync({ id: task.id, root_id: task.root_id });
        if (task.root_id && task.root_id !== task.id) {
          refetchProjects();
        }
        if (selectedTask?.id === task.id) setSelectedTask(null);
        if (taskFormState?.taskId === task.id) setTaskFormState(null);
        toast.success(t('tasks.delete_success'));
      } catch (err) {
        console.error('Failed to delete task:', err);
        toast.error(t('tasks.delete_failure'));
      }
    },
    [deleteTaskAsync, selectedTask, taskFormState, refetchProjects, confirm, t]
  );

  const handleDeleteById = useCallback(
    (taskId: string) => {
      const task = findTask(taskId);
      if (task) {
        onDeleteTaskWrapper(task as TaskRow);
      }
    },
    [findTask, onDeleteTaskWrapper]
  );

  const createTaskOrUpdateWrapper = async (data: TaskFormData, state: TaskFormState | null) => {
    // Extract recurrence_* form fields so we can stash the normalised rule
    // into `settings.recurrence` without leaking flat fields onto the DB row.
    const {
      recurrence_kind,
      recurrence_weekday,
      recurrence_day_of_month,
      recurrence_target_project_id,
      ...rest
    } = data;

    const isTemplate = state?.origin === 'template';
    const existingSettings = state?.mode === 'edit' && state?.taskId
      ? (findTask(state.taskId) as TaskRow | undefined)?.settings
      : null;
    const existingObj = existingSettings && typeof existingSettings === 'object' && !Array.isArray(existingSettings)
      ? (existingSettings as Record<string, unknown>)
      : {};

    let settingsPatch: Record<string, unknown> | undefined;
    if (isTemplate) {
      const rule = formDataToRecurrenceRule({
        recurrence_kind,
        recurrence_weekday,
        recurrence_day_of_month,
        recurrence_target_project_id,
      } as TaskFormData);
      if (recurrence_kind === 'none' || rule === null) {
        const withoutRec = { ...existingObj };
        delete withoutRec.recurrence;
        settingsPatch = withoutRec;
      } else {
        settingsPatch = { ...existingObj, recurrence: rule };
      }
    } else {
      // Instance: apply the coaching + strategy flags in sequence, preserving any other keys.
      const afterCoaching = applyCoachingFlag(existingObj, formDataToCoachingFlag(data));
      const afterStrategy = applyStrategyTemplateFlag(
        afterCoaching ?? existingObj,
        formDataToStrategyTemplateFlag(data),
      );
      // Wave 29: merge the Phase Leads array only when the form actually emitted it
      // (TaskFormFields gates the field to owners on phase/milestone rows).
      settingsPatch = Array.isArray(data.phase_lead_user_ids)
        ? applyPhaseLeads(afterStrategy ?? existingObj, data.phase_lead_user_ids)
        : afterStrategy;
    }

    if (state?.mode === 'edit' && state?.taskId) {
      return updateTaskAsync({
        id: state.taskId,
        ...rest,
        ...(settingsPatch ? { settings: settingsPatch as unknown as Json } : {}),
      });
    }
    return createTaskAsync({
      ...rest,
      root_id: activeProjectId || null,
      origin: state?.origin || 'instance',
      parent_task_id: state?.parentId || null,
      ...(settingsPatch ? { settings: settingsPatch as unknown as Json } : {}),
    } as TaskInsert);
  };

  const handleTaskSubmit = async (formData: TaskFormData) => {
    try {
      await createTaskOrUpdateWrapper(formData, taskFormState);
      if (activeProjectId) {
        refetchProjects();
      } else if (taskFormState?.parentId) {
        const parent = findTask(taskFormState.parentId);
        if (parent && ((parent as TaskRow).root_id || parent.id)) {
          refetchProjects();
        }
      }
      setTaskFormState(null);
      toast.success(t('projects.task_saved_toast'));
    } catch (err) {
      console.error('Failed to save task:', err);
      toast.error(t('projects.task_save_failed_retry_toast'));
    }
  };

  // --- Derived state for TaskDetailsPanel ---
  const parentTaskForForm = taskFormState?.parentId ? (findTask(taskFormState.parentId) || (projectHierarchy as TaskRow[]).find((t: TaskRow) => t.id === taskFormState.parentId)) : null;
  const taskBeingEdited = taskFormState?.mode === 'edit' && taskFormState.taskId
    ? (findTask(taskFormState.taskId) || (projectHierarchy as TaskRow[]).find((t: TaskRow) => t.id === taskFormState.taskId))
    : null;

  const sidebarContent = (
    <ProjectSidebar
      joinedProjects={(joinedProjects as Project[]) || []}
      instanceTasks={instanceTasks as TaskRow[]}
      templateTasks={templateTasks as TaskRow[]}
      projectsLoading={projectsLoading}
      joinedLoading={joinedLoading}
      templatesLoading={templatesLoading}
      error={error as string | null}
      handleSelectProject={handleSelectProject}
      selectedTaskId={activeProjectId}
      onNewProjectClick={() => navigate('/projects/new')}
      onNewTemplateClick={() => {
        setSelectedTask(null);
        setTaskFormState({ mode: 'create', origin: 'template', parentId: null });
      }}
    />
  );

  if (error) {
    return (
      <DashboardLayout sidebar={sidebarContent}>
        <StatusCard
          title="Error Loading Projects"
          description={error}
          variant="error"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebar={sidebarContent}>
      <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
        {activeProject ? (
          <ProjectTasksView
            project={{ ...activeProject, origin: activeProject.origin ?? undefined } as TaskRow & { children?: TaskRow[]; origin?: string }}
            handleTaskClick={handleEditTask}
            handleAddChildTask={handleAddChildTask}
            handleEditTask={handleEditTask}
            handleDeleteById={handleDeleteById}
            onToggleExpand={(id: string) => handleToggleExpand({ id }, true)}
            onStatusChange={(id, status) => updateTaskAsync({ id, status })}
            disableDrag={joinedProjects?.some((jp: Project) => jp.id === activeProjectId)}
          />
        ) : (
          <EmptyProjectState
            onCreateProject={() => navigate('/projects/new')}
          />
        )}

        <TaskDetailsPanel
          showForm={showForm}
          taskFormState={taskFormState ?? undefined}
          selectedTask={selectedTask ?? undefined}
          taskBeingEdited={(taskBeingEdited as TaskRow | undefined) ?? undefined}
          parentTaskForForm={(parentTaskForForm as TaskRow | undefined) ?? undefined}
          onClose={() => setSelectedTask(null)}
          handleTaskSubmit={handleTaskSubmit}
          setTaskFormState={(state) => setTaskFormState(state as TaskFormState)}
          handleAddChildTask={handleAddChildTask}
          handleEditTask={handleEditTask}
          onDeleteTaskWrapper={async (taskId: string) => { const t = findTask(taskId); if (t) await onDeleteTaskWrapper(t as TaskRow); }}
          fetchTasks={refetchProjects}
          allProjectTasks={projectHierarchy as TaskRow[]}
          renderLibrarySearch={(onSelect) => (
            <MasterLibrarySearch
              mode="copy"
              onSelect={onSelect}
              label={t('projects.form.search_library_label')}
              placeholder={t('projects.search_template_task_placeholder')}
              excludeTemplateIds={excludedTemplateIds}
            />
          )}
        />
      </div>
    </DashboardLayout>
  );
};

export default TaskList;
