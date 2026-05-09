import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/shared/contexts/auth-context';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectData } from '@/features/projects/hooks/useProjectData';
import { useProjectBoard } from "@/features/projects/hooks/useProjectBoard";
import { ROLES, TASK_STATUS } from '@/shared/constants';
import { compareDateAsc, toIsoDate } from '@/shared/lib/date-engine';
import { collectSpawnedTemplateIds } from '@/shared/lib/tree-helpers';
import { constructCreatePayload, constructUpdatePayload } from '@/shared/lib/date-engine/payloadHelpers';
import { buildTemplateFlagSettingsPatch } from '@/features/tasks/lib/task-form-flags';
import { planter } from '@/shared/api/planterClient';
import { ProjectDndShell } from '@/pages/components/ProjectDndShell';

import { Loader2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { useCreateTask, useDeleteTask, useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { toast } from 'sonner';
import type { TaskRow, Project as ProjectType, TaskFormData } from '@/shared/db/app.types';

import ProjectHeader from '@/features/projects/components/ProjectHeader';
import ProjectTabs from '@/features/projects/components/ProjectTabs';
import PeopleList from '@/features/people/components/PeopleList';
import PhaseCard from '@/features/projects/components/PhaseCard';
import MilestoneSection from '@/features/tasks/components/MilestoneSection';
import InviteMemberModal from '@/features/projects/components/InviteMemberModal';
import TaskDetailsPanel from '@/features/tasks/components/TaskDetailsPanel';
import MasterLibrarySearch from '@/features/library/components/MasterLibrarySearch';
import ResourceLibrary from '@/features/projects/components/ResourceLibrary';
import ProjectActivityTab from '@/features/projects/components/ProjectActivityTab';
import { useProjectPresence } from '@/features/projects/hooks/useProjectPresence';
import { useProjectRealtime } from '@/features/projects/hooks/useProjectRealtime';
import { PresenceBar } from '@/features/projects/components/PresenceBar';
import {
    canCreateChildTask,
    canDeleteTask as canDeleteTaskForRole,
    canEditTaskContent,
    canReorderTask,
    canUpdateTaskProgress,
} from '@/features/tasks/lib/task-permissions';
import { canManageProjectMembers } from '@/features/projects/lib/project-member-permissions';
import { getTaskMoveParentOptions } from '@/features/tasks/lib/task-move-options';

export default function Project() {
    // Canonical URL form is /Project/:projectId. The legacy /Project?id=X
    // form was dropped post-megabatch — every in-app caller now uses the
    // param form. Bookmarks on the old URL land on the "pick a project"
    // empty state, which is acceptable for a handful of cases.
    const { projectId } = useParams<{ projectId: string }>();
    const { user } = useAuth();
    const { t } = useTranslation();

    const {
        project,
        loadingProject,
        projectError,
        phases,
        milestones,
        tasks,
        projectHierarchy,
        teamMembers,
        refetchProject,
    } = useProjectData(projectId);

    // Template ids already cloned into this project — excluded from the
    // Master Library combobox so the same template can't be added twice.
    const excludedTemplateIds = useMemo(
        () => collectSpawnedTemplateIds(tasks),
        [tasks],
    );

    const createTask = useCreateTask();
    const updateTask = useUpdateTask();
    const deleteTask = useDeleteTask();

    const board = useProjectBoard(projectId, (tasks as TaskRow[]) || [], {
        updateTask: (payload, options) => updateTask.mutate(payload, options),
        createTask: (payload) => createTask.mutateAsync(payload),
        deleteTask: (payload, options) => deleteTask.mutate(payload, options),
    });
    const { state, actions, handlers, computed } = board;

    // Wave 27: open the per-project presence channel and publish the focused
    // task through the same subscribed channel.
    const { presentUsers } = useProjectPresence(projectId ?? null, state.selectedTask?.id ?? null);
    useProjectRealtime(projectId ?? null, { enabled: !!projectId });

    const queryClient = useQueryClient();

    // Form states restored
    const [taskFormState, setTaskFormState] = useState<{ mode?: 'create' | 'edit'; origin?: 'instance' | 'template'; isPhase?: boolean } | null>(null);
    const [moveDialogTask, setMoveDialogTask] = useState<TaskRow | null>(null);
    const [moveTargetParentId, setMoveTargetParentId] = useState<string>('');

    const handleTaskSubmit = async (formData: TaskFormData) => {
        try {
            const mode = taskFormState?.mode;
            const origin = taskFormState?.origin || 'instance';
            const parentId = state.inlineAddingParentId || projectId || null;

            const payloadContext = {
                origin,
                parentId,
                rootId: projectId,
                contextTasks: tasks as TaskRow[] || [],
                userId: user?.id || '',
                maxPosition: Math.max(0, ...((tasks || []) as TaskRow[]).filter(t => t.parent_task_id === parentId).map(t => t.position || 0))
            };

            if (mode === 'edit' && state.selectedTask) {
                const updatePayload = constructUpdatePayload(formData, state.selectedTask, payloadContext);
                const settingsPatch = buildTemplateFlagSettingsPatch(
                    origin,
                    formData,
                    state.selectedTask.settings,
                );
                await updateTask.mutateAsync({
                    id: state.selectedTask.id,
                    ...updatePayload,
                    ...(settingsPatch !== undefined ? { settings: settingsPatch as TaskRow['settings'] } : {}),
                    root_id: projectId
                });
                setTaskFormState(null);
                toast.success(t('projects.task_updated_toast'));
            } else {
                const extendedFormData = formData as TaskFormData & { templateId?: string | null };
                if (extendedFormData.templateId) {
                    const manualStartDate = toIsoDate(formData.start_date as string);
                    const manualDueDate = toIsoDate(formData.due_date as string);
                    const { error } = await planter.entities.Task.clone(
                        extendedFormData.templateId,
                        parentId,
                        origin,
                        user?.id as string,
                        {
                            title: formData.title,
                            description: formData.description,
                            start_date: manualStartDate ?? undefined,
                            due_date: manualDueDate ?? undefined,
                        }
                    );
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ['projectHierarchy', projectId] });
                } else {
                    const createPayload = constructCreatePayload(formData, payloadContext);
                    const settingsPatch = buildTemplateFlagSettingsPatch(origin, formData, null);
                    await createTask.mutateAsync({
                        ...createPayload,
                        root_id: projectId,
                        is_complete: false,
                        ...(settingsPatch !== undefined ? { settings: settingsPatch as TaskRow['settings'] } : {})
                    });
                }
                setTaskFormState(null);
                actions.setInlineAddingParentId(null);
                toast.success(t('projects.task_created_toast'));
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('errors.unknown');
            toast.error(t('projects.task_save_failed_toast'), { description: message });
            throw error;
        }
    };

    const isOwnerByProject = project?.creator === user?.id;
    const isGlobalAdmin = user?.role === ROLES.ADMIN;
    const currentMember = teamMembers?.find((m: { user_id?: string }) => m.user_id === user?.id);
    const userRole = isGlobalAdmin ? ROLES.ADMIN : currentMember?.role || (isOwnerByProject ? ROLES.OWNER : ROLES.VIEWER);
    const projectTaskRows = useMemo(() => (projectHierarchy as TaskRow[]) || [], [projectHierarchy]);

    const canEdit = canEditTaskContent(userRole);
    const canCreateTasks = canCreateChildTask(userRole);
    const canReorderTasks = canReorderTask(userRole);
    const canInvite = canManageProjectMembers(userRole);
    const canManageSettings = canManageProjectMembers(userRole);
    const canEditTaskForRow = useCallback(
        (task: TaskRow) => canEditTaskContent(userRole, {
            task,
            allProjectTasks: projectTaskRows,
            userId: user?.id ?? null,
        }),
        [projectTaskRows, user?.id, userRole],
    );
    const canUpdateTaskStatusForRow = useCallback(
        (task: TaskRow) => canUpdateTaskProgress(userRole, task, {
            allProjectTasks: projectTaskRows,
            userId: user?.id ?? null,
        }),
        [projectTaskRows, user?.id, userRole],
    );
    const handleInvalidHierarchyDrop = useCallback(() => {
        toast.error(t('projects.invalid_task_hierarchy_drop'));
    }, [t]);
    const canMoveTaskWithoutDnd = useCallback(
        (task: TaskRow) => getTaskMoveParentOptions(task, projectTaskRows).length > 0,
        [projectTaskRows],
    );
    const openMoveTaskDialog = useCallback(
        (task: TaskRow) => {
            const options = getTaskMoveParentOptions(task, projectTaskRows);
            setMoveDialogTask(task);
            setMoveTargetParentId(options[0]?.id ?? '');
        },
        [projectTaskRows],
    );
    const moveParentOptions = useMemo(
        () => moveDialogTask ? getTaskMoveParentOptions(moveDialogTask, projectTaskRows) : [],
        [moveDialogTask, projectTaskRows],
    );
    const closeMoveTaskDialog = useCallback(() => {
        setMoveDialogTask(null);
        setMoveTargetParentId('');
    }, []);
    const handleMoveTask = useCallback(() => {
        if (!moveDialogTask || !moveTargetParentId) return;
        if (!moveParentOptions.some((option) => option.id === moveTargetParentId)) {
            toast.error(t('projects.invalid_task_hierarchy_drop'));
            return;
        }

        handlers.handleTaskUpdate(moveDialogTask.id, {
            parent_task_id: moveTargetParentId,
            root_id: projectId ?? moveDialogTask.root_id,
        });
        const targetParent = projectTaskRows.find((task) => task.id === moveTargetParentId);
        if (targetParent) handlers.handleToggleExpand(targetParent, true);
        closeMoveTaskDialog();
    }, [closeMoveTaskDialog, handlers, moveDialogTask, moveParentOptions, moveTargetParentId, projectId, projectTaskRows, t]);

    const sortedPhases = [...(phases || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    const activePhase = state.selectedPhase || sortedPhases[0];

    const projectMilestones = useMemo(() =>
        ((milestones || []) as TaskRow[]).sort((a: TaskRow, b: TaskRow) => compareDateAsc(a.due_date, b.due_date)),
        [milestones]
    );

    const phaseMilestones = projectMilestones
        .filter((m: TaskRow) => m.parent_task_id === activePhase?.id)
        .filter((m: TaskRow) => {
            const childTasks = (tasks as TaskRow[] || []).filter(t => t.parent_task_id === m.id);
            if (childTasks.length === 0) return true;
            return childTasks.some(t => t.status !== TASK_STATUS.COMPLETED);
        })
        .sort((a: TaskRow, b: TaskRow) => (a.position || 0) - (b.position || 0));

    if (loadingProject) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 data-testid="loading-spinner" className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    // The primary project-metadata query either errored (network / RLS denial
    // / bad id) or returned null. Render a recoverable error card instead of
    // an infinite spinner — user can retry or bail to the task list. Before
    // this change, an expired membership or a mistyped UUID froze the route.
    if (projectError || !project) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
                <p className="text-destructive font-medium">{t('errors.failed_load_project')}</p>
                <p className="text-muted-foreground text-sm max-w-md">
                    {projectError?.message ?? t('errors.project_not_found_or_no_access')}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetchProject()}>
                        {t('common.retry')}
                    </Button>
                    <Button asChild variant="ghost">
                        <Link to="/tasks">{t('errors.back_to_tasks')}</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const projectOrigin = (project as TaskRow)?.origin === 'template' ? 'template' : 'instance';

    return (
        <>
            <div className="flex h-full gap-8 min-w-0">
            <ProjectDndShell
                tasks={projectTaskRows}
                onTaskUpdate={canReorderTasks ? handlers.handleTaskUpdate : () => undefined}
                onToggleExpand={handlers.handleToggleExpand}
                onInvalidDrop={handleInvalidHierarchyDrop}
            >
            {(dropIndicator) => (
                <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto custom-scrollbar pr-4">
                    <ProjectHeader
                        project={project as ProjectType}
                        tasks={tasks as TaskRow[]}
                        stateTasks={projectTaskRows}
                        teamMembers={teamMembers}
                        canInvite={canInvite}
                        canManageSettings={canManageSettings}
                        onInviteMember={() => actions.setShowInviteModal(true)}
                    />

                    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        <div className="flex items-center justify-between mb-6">
                            <ProjectTabs activeTab={state.activeTab} onTabChange={actions.setActiveTab} />
                            <PresenceBar presentUsers={presentUsers} currentUserId={user?.id ?? null} />

                            {canCreateTasks && state.activeTab === 'board' && (
                                <Button
                                    onClick={() => setTaskFormState({ mode: 'create', origin: projectOrigin, isPhase: true })}
                                    className="bg-brand-500 hover:bg-brand-600 text-white"
                                >
                                    <Plus aria-hidden="true" className="w-4 h-4 mr-2" />
                                    {t('projects.add_phase_button')}
                                </Button>
                            )}
                        </div>

                        {state.activeTab === 'board' && (
                            <>
                                <div className="mb-8">
                                    <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('projects.phases_heading')}</h2>
                                    <div className="flex gap-4 overflow-x-auto pb-2">
                                        {sortedPhases.map((phase) => (
                                            <div key={phase.id} className="min-w-[200px] flex-1">
                                                <PhaseCard
                                                    phase={phase as TaskRow}
                                                    tasks={tasks as TaskRow[]}
                                                    milestones={(milestones || []).filter((m) => (m as TaskRow).parent_task_id === phase.id) as TaskRow[]}
                                                    isActive={activePhase?.id === phase.id}
                                                    onClick={() => actions.setSelectedPhase(phase as TaskRow)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {activePhase && (
                                    <div className="animate-slide-up">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h2 className="text-xl font-semibold text-slate-900">
                                                    {t('projects.phase_heading_title', {
                                                        position: (activePhase as { position?: number }).position,
                                                        title: (activePhase as { title?: string }).title,
                                                    })}
                                                </h2>
                                                {(activePhase as { description?: string }).description && (
                                                    <p className="text-slate-600 mt-1">{(activePhase as { description?: string }).description}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {phaseMilestones.length === 0 ? (
                                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                                                    <p className="text-slate-500 mb-4">{t('projects.no_milestones_in_phase')}</p>
                                                    {canCreateTasks && (
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => {
                                                                actions.setInlineAddingParentId(activePhase.id);
                                                                setTaskFormState({ mode: 'create', origin: projectOrigin });
                                                            }}
                                                            className="text-brand-600 border-brand-200 hover:bg-brand-50"
                                                        >
                                                            <Plus aria-hidden="true" className="w-4 h-4 mr-2" />
                                                            {t('projects.add_milestone_button')}
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : (
                                                phaseMilestones.map((milestone: TaskRow) => (
                                                    <MilestoneSection
                                                        key={milestone.id}
                                                        milestone={milestone}
                                                        tasks={computed.getTasksWithStateForParent(milestone.id)}
                                                        onTaskUpdate={handlers.handleTaskUpdate as (id: string, updates: Partial<TaskRow>) => void}
                                                        onAddChildTask={canCreateTasks ? handlers.handleStartInlineAdd : undefined}
                                                        onMoveTask={canReorderTasks ? openMoveTaskDialog : undefined}
                                                        canMoveTask={canMoveTaskWithoutDnd}
                                                        onToggleExpand={handlers.handleToggleExpand}
                                                        onTaskClick={(task: TaskRow) => {
                                                            handlers.handleTaskClick(task);
                                                            setTaskFormState(canEditTaskForRow(task) ? { mode: 'edit', origin: projectOrigin } : null);
                                                        }}
                                                        onInlineCommit={canCreateTasks ? handlers.handleInlineCommit : undefined}
                                                        onInlineCancel={() => actions.setInlineAddingParentId(null)}
                                                        canEdit={canEdit}
                                                        canUpdateTaskStatus={canUpdateTaskStatusForRow}
                                                        disableDrag={!canReorderTasks}
                                                        isAddingInline={state.inlineAddingParentId === milestone.id}
                                                        dropIndicator={dropIndicator}
                                                        presentUsers={presentUsers}
                                                        currentUserId={user?.id ?? null}
                                                    />
                                                ))
                                            )}

                                            {canCreateTasks && phaseMilestones.length > 0 && (
                                                <Button
                                                    variant="ghost"
                                                    className="w-full text-slate-500 hover:text-slate-700"
                                                    onClick={() => {
                                                        actions.setInlineAddingParentId(activePhase.id);
                                                        setTaskFormState({ mode: 'create', origin: projectOrigin });
                                                    }}
                                                >
                                                    <Plus aria-hidden="true" className="w-4 h-4 mr-2" />
                                                    {t('projects.add_milestone_button')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {state.activeTab === 'people' && (
                            <PeopleList projectId={projectId as string} canEdit={canEdit} />
                        )}

                        {state.activeTab === 'resources' && (
                            <ResourceLibrary projectId={projectId!} />
                        )}

                        {state.activeTab === 'activity' && (
                            <ProjectActivityTab projectId={projectId ?? null} />
                        )}
                    </div>
                </div>

            )}
            </ProjectDndShell>

                {(state.selectedTask || taskFormState) && (
                    <TaskDetailsPanel
                        showForm={Boolean(taskFormState)}
                        taskFormState={taskFormState}
                        selectedTask={state.selectedTask || undefined}
                        taskBeingEdited={taskFormState?.mode === 'edit' ? state.selectedTask || undefined : undefined}
                        parentTaskForForm={state.inlineAddingParentId ? (tasks?.find(t => t.id === state.inlineAddingParentId) as TaskRow) : undefined}
                        membershipRole={userRole}
                        allProjectTasks={projectTaskRows}
                        teamMembers={teamMembers}
                        showComments={false}
                        onClose={() => {
                            actions.setSelectedTask(null);
                            setTaskFormState(null);
                            actions.setInlineAddingParentId(null);
                        }}
                        setTaskFormState={setTaskFormState}
                        handleTaskSubmit={handleTaskSubmit}
                        renderLibrarySearch={(onSelect) => (
                            <MasterLibrarySearch
                                mode="copy"
                                onSelect={onSelect}
                                label={t('projects.form.search_library_label')}
                                placeholder={taskFormState?.isPhase ? t('projects.search_template_phase_placeholder') : t('projects.search_template_task_placeholder')}
                                phasesOnly={!!taskFormState?.isPhase}
                                excludeTemplateIds={excludedTemplateIds}
                            />
                        )}
                        canEdit={state.selectedTask ? canEditTaskForRow(state.selectedTask) : canEdit}
                        onDeleteTaskWrapper={
                            state.selectedTask && canDeleteTaskForRole(userRole, state.selectedTask)
                                ? async () => { if (state.selectedTask) await handlers.handleDeleteTask(state.selectedTask); }
                                : undefined
                        }
                        handleAddChildTask={canCreateTasks ? handlers.handleStartInlineAdd : undefined}
                        handleEditTask={(task) => {
                            actions.setSelectedTask(task as TaskRow);
                            setTaskFormState({ mode: 'edit', origin: projectOrigin });
                        }}
                    />
                )}
            </div>

            {state.showInviteModal && (
                <InviteMemberModal
                    project={project as ProjectType}
                    onClose={() => actions.setShowInviteModal(false)}
                    onInviteSuccess={() => { }}
                />
            )}

            <Dialog
                open={moveDialogTask !== null}
                onOpenChange={(open) => {
                    if (!open) closeMoveTaskDialog();
                }}
            >
                <DialogContent data-testid="move-task-dialog">
                    <DialogHeader>
                        <DialogTitle>
                            {t('tasks.move_dialog.title', {
                                title: moveDialogTask?.title ?? t('common.untitled_task'),
                            })}
                        </DialogTitle>
                        <DialogDescription>{t('tasks.move_dialog.description')}</DialogDescription>
                    </DialogHeader>

                    {moveParentOptions.length > 0 ? (
                        <div className="space-y-2">
                            <Label htmlFor="move-task-target">{t('tasks.move_dialog.target_label')}</Label>
                            <select
                                id="move-task-target"
                                value={moveTargetParentId}
                                onChange={(event) => setMoveTargetParentId(event.target.value)}
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                data-testid="move-task-target"
                            >
                                {moveParentOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.title ?? t('common.untitled_task')}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('tasks.move_dialog.no_targets')}</p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeMoveTaskDialog}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleMoveTask}
                            disabled={!moveTargetParentId}
                            data-testid="move-task-submit"
                        >
                            {t('tasks.move_dialog.submit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
