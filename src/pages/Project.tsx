import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/db/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useProjectData } from '@/features/projects/hooks/useProjectData';
import { useProjectBoard } from "@/features/projects/hooks/useProjectBoard";
import { ROLES, TASK_STATUS } from '@/shared/constants';
import { compareDateAsc, toIsoDate } from '@/shared/lib/date-engine';
import { collectSpawnedTemplateIds } from '@/shared/lib/tree-helpers';
import { constructCreatePayload, constructUpdatePayload } from '@/shared/lib/date-engine/payloadHelpers';
import { applyCoachingFlag, formDataToCoachingFlag } from '@/features/tasks/lib/coaching-form';
import { applyStrategyTemplateFlag, formDataToStrategyTemplateFlag } from '@/features/tasks/lib/strategy-form';
import { planter } from '@/shared/api/planterClient';
import { ProjectDndShell } from '@/pages/components/ProjectDndShell';

import { Loader2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { useCreateTask, useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { toast } from 'sonner';
import type { TaskRow, Project as ProjectType, TaskFormData, PersonRow } from '@/shared/db/app.types';

import ProjectHeader from '@/features/projects/components/ProjectHeader';
import ProjectTabs from '@/features/projects/components/ProjectTabs';
import PeopleList from '@/features/people/components/PeopleList';
import PhaseCard from '@/features/projects/components/PhaseCard';
import MilestoneSection from '@/features/projects/components/MilestoneSection';
import InviteMemberModal from '@/features/projects/components/InviteMemberModal';
import TaskDetailsPanel from '@/features/tasks/components/TaskDetailsPanel';
import MasterLibrarySearch from '@/features/library/components/MasterLibrarySearch';
import ResourceLibrary from '@/features/projects/components/ResourceLibrary';
import ProjectActivityTab from '@/features/projects/components/ProjectActivityTab';
import { useProjectPresence } from '@/features/projects/hooks/useProjectPresence';
import { PresenceBar } from '@/features/projects/components/PresenceBar';

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
        teamMembers,
        refetchProject,
    } = useProjectData(projectId);

    // Wave 27: open the per-project presence channel. No-op outside /Project/:id
    // because `projectId` is undefined on other routes, so the hook short-circuits.
    const { presentUsers } = useProjectPresence(projectId ?? null);

    // Template ids already cloned into this project — excluded from the
    // Master Library combobox so the same template can't be added twice.
    const excludedTemplateIds = useMemo(
        () => collectSpawnedTemplateIds(tasks),
        [tasks],
    );

    const board = useProjectBoard(projectId, (tasks as TaskRow[]) || []);
    const { state, actions, handlers, computed } = board;

    const queryClient = useQueryClient();
    const lastUpdateRef = useRef(0);

    // Form states restored
    const [taskFormState, setTaskFormState] = useState<{ mode?: 'create' | 'edit'; origin?: 'instance' | 'template'; isPhase?: boolean } | null>(null);

    const createTask = useCreateTask();
    const updateTask = useUpdateTask();

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
                const coachingFlag = formDataToCoachingFlag(formData);
                const strategyFlag = formDataToStrategyTemplateFlag(formData);
                const afterCoaching = applyCoachingFlag(
                    state.selectedTask.settings as Record<string, unknown> | null | undefined,
                    coachingFlag,
                );
                const settingsPatch = applyStrategyTemplateFlag(
                    afterCoaching ?? (state.selectedTask.settings as Record<string, unknown> | null | undefined),
                    strategyFlag,
                );
                await updateTask.mutateAsync({
                    id: state.selectedTask.id,
                    ...updatePayload,
                    ...(settingsPatch !== undefined ? { settings: settingsPatch as TaskRow['settings'] } : {}),
                    root_id: projectId
                });
                setTaskFormState(null);
                toast.success('Task updated successfully');
            } else {
                const extendedFormData = formData as TaskFormData & { templateId?: string | null };
                if (extendedFormData.templateId) {
                    const hasManualDates = Boolean(formData.start_date || formData.due_date);
                    const { error } = await planter.entities.Task.clone(
                        extendedFormData.templateId,
                        parentId,
                        origin,
                        user?.id as string,
                        {
                            title: formData.title,
                            description: formData.description,
                            start_date: hasManualDates ? toIsoDate(formData.start_date as string) : undefined,
                            due_date: hasManualDates ? (toIsoDate(formData.due_date as string) || toIsoDate(formData.start_date as string)) : undefined,
                        }
                    );
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ['projectHierarchy', projectId] });
                } else {
                    const createPayload = constructCreatePayload(formData, payloadContext);
                    const coachingFlag = formDataToCoachingFlag(formData);
                    const strategyFlag = formDataToStrategyTemplateFlag(formData);
                    const afterCoaching = applyCoachingFlag(null, coachingFlag);
                    const settingsPatch = applyStrategyTemplateFlag(afterCoaching, strategyFlag);
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

    useEffect(() => {
        if (!projectId) return;

        // Comments use a per-task channel mounted by TaskComments — see useTaskCommentsRealtime. Don't merge here.
        const channel = supabase
            .channel(`project-tasks:${projectId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tasks',
                },
                (payload: RealtimePostgresChangesPayload<TaskRow>) => {
                    const now = Date.now();
                    // Debounce bursts (e.g. cascade updates)
                    if (now - lastUpdateRef.current < 500) return;
                    lastUpdateRef.current = now;

                    // Note: payload.old is only fully populated if replica identity is set to full on the DB.
                    // Usually payload.new is what we care about for INSERT/UPDATE. We cast appropriately.
                    const newRecord = payload.new as TaskRow | undefined;
                    const oldRecord = payload.old as TaskRow | undefined;
                    const record = newRecord || oldRecord;

                    if (!record) return;

                    // We only care if:
                    // 1. It IS the project itself
                    // 2. Its root_id matches the project
                    // 3. Its parent_task_id matches the project (Direct child)
                    const isRelevant =
                        record.id === projectId ||
                        record.root_id === projectId ||
                        record.parent_task_id === projectId;

                    if (isRelevant) {
                        // Invalidate specific project hierarchy queries
                        queryClient.invalidateQueries({ queryKey: ['projectHierarchy', projectId] });

                        // If it changed metadata that affects the header (name, dates), refresh project too
                        if (record.id === projectId || !record.root_id) {
                            queryClient.invalidateQueries({ queryKey: ['project', projectId] });
                        }
                    }
                }
            )
            .subscribe((_, err) => {
                if (err) {
                    console.error('[Project Realtime] Channel error:', err);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [projectId, queryClient]);

    const isOwnerByProject = project?.creator === user?.id;
    const currentMember = teamMembers?.find((m: { user_id?: string }) => m.user_id === user?.id);
    const userRole = currentMember?.role || (isOwnerByProject ? ROLES.OWNER : ROLES.VIEWER);

    const canEdit = userRole === ROLES.OWNER || userRole === ROLES.ADMIN || userRole === ROLES.EDITOR;
    const canInvite = userRole === ROLES.OWNER || userRole === ROLES.ADMIN || userRole === ROLES.EDITOR;
    const canManageSettings = userRole === ROLES.OWNER || userRole === ROLES.ADMIN;

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
    // an infinite spinner — user can retry or bail to the dashboard. Before
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
                        <Link to="/dashboard">{t('errors.back_to_dashboard')}</Link>
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
                tasks={(tasks as TaskRow[]) || []}
                onTaskUpdate={handlers.handleTaskUpdate}
                onToggleExpand={handlers.handleToggleExpand}
            >
            {(dropIndicator) => (
                <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto custom-scrollbar pr-4">
                    <ProjectHeader
                        project={project as ProjectType}
                        tasks={tasks as TaskRow[]}
                        teamMembers={teamMembers as unknown as PersonRow[]}
                        canInvite={canInvite}
                        canManageSettings={canManageSettings}
                        onInviteMember={() => actions.setShowInviteModal(true)}
                    />

                    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        <div className="flex items-center justify-between mb-6">
                            <ProjectTabs activeTab={state.activeTab} onTabChange={actions.setActiveTab} />
                            <PresenceBar presentUsers={presentUsers} currentUserId={user?.id ?? null} />

                            {canEdit && state.activeTab === 'board' && (
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
                                                    {canEdit && (
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
                                                        tasks={(tasks as TaskRow[] || []).map(computed.mapTaskWithState) as TaskRow[]}
                                                        onTaskUpdate={canEdit ? (handlers.handleTaskUpdate as (id: string, updates: Partial<TaskRow>) => void) : undefined}
                                                        onAddChildTask={canEdit ? handlers.handleStartInlineAdd : undefined}
                                                        onToggleExpand={handlers.handleToggleExpand}
                                                        onTaskClick={(task: TaskRow) => {
                                                            handlers.handleTaskClick(task);
                                                            setTaskFormState({ mode: 'edit', origin: projectOrigin });
                                                        }}
                                                        onInlineCommit={canEdit ? handlers.handleInlineCommit : undefined}
                                                        onInlineCancel={() => actions.setInlineAddingParentId(null)}
                                                        canEdit={canEdit}
                                                        isAddingInline={state.inlineAddingParentId === milestone.id}
                                                        dropIndicator={dropIndicator}
                                                        presentUsers={presentUsers}
                                                        currentUserId={user?.id ?? null}
                                                    />
                                                ))
                                            )}

                                            {canEdit && phaseMilestones.length > 0 && (
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
                                label="Search master library"
                                placeholder={taskFormState?.isPhase ? 'Search for a template phase to copy' : 'Start typing to copy an existing template task'}
                                phasesOnly={!!taskFormState?.isPhase}
                                excludeTemplateIds={excludedTemplateIds}
                            />
                        )}
                        onDeleteTaskWrapper={async () => { if (state.selectedTask) await handlers.handleDeleteTask(state.selectedTask); }}
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
        </>
    );
}
