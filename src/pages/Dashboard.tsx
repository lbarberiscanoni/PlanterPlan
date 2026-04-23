import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TaskRow, Project, TaskInsert, CreateProjectFormData } from '@/shared/db/app.types';
import type { Database } from '@/shared/db/database.types';
import type { CreateProjectPayload } from '@/features/projects/hooks/useProjectMutations';
import { Button } from '@/shared/ui/button';
import { Plus, FolderKanban, Loader2, BookTemplate } from 'lucide-react';

// Hooks
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { useCreateProject, useUpdateProjectStatus } from '@/features/projects/hooks/useProjectMutations';
import { planter } from '@/shared/api/planterClient';
import { useProjectRealtime } from '@/features/projects/hooks/useProjectRealtime';

// Components
import CreateProjectModal from '@/features/dashboard/components/CreateProjectModal';
import CreateTemplateModal from '@/features/dashboard/components/CreateTemplateModal';
import StatsOverview from '@/features/dashboard/components/StatsOverview';
import ProjectPipelineBoard from '@/features/dashboard/components/ProjectPipelineBoard';
import OnboardingWizard from '@/pages/components/OnboardingWizard';
import MobileAgenda from '@/features/mobile/components/MobileAgenda';

export default function Dashboard() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    useProjectRealtime();

    const { state, data, actions } = useDashboard();

    const createProjectMutation = useCreateProject();
    const updateStatusMutation = useUpdateProjectStatus();

    const handleCreateProject = async (projectData: CreateProjectFormData) => {
        try {
            const project = await createProjectMutation.mutateAsync(projectData as unknown as CreateProjectPayload);
            if (project?.id) {
                navigate(`/project/${project.id}`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('errors.unknown');
            toast.error(t('errors.failed_create_project'), { description: message });
        }
    };

    const handleStatusChange = async (projectId: string, newStatus: string) => {
        try {
            await updateStatusMutation.mutateAsync({ projectId, status: newStatus });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('errors.unknown');
            toast.error(t('errors.failed_move_project'), { description: message });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        }
    };

    const handleCreateTemplate = async (data: { title: string; description: string; isPublished: boolean }) => {
        try {
            const userId = state.user?.id;
            if (!userId) throw new Error(t('errors.user_must_be_logged_in'));

            const template = await planter.entities.Task.create({
                title: data.title,
                description: data.description,
                origin: 'template',
                parent_task_id: null,
                root_id: null,
                status: 'planning',
                creator: userId,
                assignee_id: userId,
                settings: { published: data.isPublished },
            } as TaskInsert);
            if (template?.id) {
                // Add creator as owner so RLS allows access
                await planter.entities.TeamMember.create({
                    project_id: template.id,
                    user_id: userId,
                    role: 'owner',
                } as Database['public']['Tables']['project_members']['Insert']);
                toast.success(t('dashboard.template_created_toast'));
                queryClient.invalidateQueries({ queryKey: ['projects', 'template'] });
                navigate(`/project/${template.id}`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('errors.unknown');
            toast.error(t('errors.failed_create_template'), { description: message });
        }
    };

    if (state.isLoading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 data-testid="loading-spinner" className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    if (state.isError) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <p className="text-destructive font-medium">{t('errors.failed_load_projects')}</p>
                <p className="text-muted-foreground text-sm">{state.error?.message}</p>
                <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['projects'] })}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full px-4 py-8 h-[calc(100vh-64px)] flex flex-col">
            {/* Header */}
            <div className="animate-slide-up flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-card-foreground">{t('dashboard.title')}</h1>
                    <p className="text-muted-foreground mt-1">{t('dashboard.subtitle')}</p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => actions.setShowTemplateModal(true)}
                        data-testid="dashboard-new-template-btn"
                    >
                        <BookTemplate className="w-5 h-5 mr-2" />
                        {t('dashboard.new_template')}
                    </Button>
                    <Button
                        onClick={() => actions.setShowCreateModal(true)}
                        className="bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/20 "
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        {t('dashboard.new_project')}
                    </Button>
                </div>
            </div>

            {/* Stats and Top Widgets */}
            <div className="mb-8 flex-shrink-0">
                <MobileAgenda tasks={data.filteredTasks as TaskRow[]} />
                <StatsOverview projects={data.projects as Project[]} tasks={data.filteredTasks as TaskRow[]} />
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                {data.projects.length === 0 ? (
                    <div className="animate-slide-up bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <FolderKanban className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold text-card-foreground mb-2">{t('dashboard.no_projects_title')}</h3>
                        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                            {t('dashboard.no_projects_description')}
                        </p>
                        <Button onClick={() => actions.setShowCreateModal(true)} className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="w-5 h-5 mr-2" />
                            {t('dashboard.create_first_project')}
                        </Button>
                    </div>
                ) : (
                    <ProjectPipelineBoard
                        projects={data.projects}
                        tasks={data.filteredTasks}
                        teamMembers={data.teamMembers}
                        onStatusChange={handleStatusChange}
                    />
                )}
            </div>

            <CreateProjectModal
                open={state.showCreateModal}
                onClose={() => actions.setShowCreateModal(false)}
                onSubmit={handleCreateProject}
            />

            <CreateTemplateModal
                open={state.showTemplateModal}
                onClose={() => actions.setShowTemplateModal(false)}
                onSubmit={handleCreateTemplate}
            />

            <OnboardingWizard
                open={!state.isLoading && data.projects.length === 0 && !state.wizardDismissed}
                onCreateProject={async (wizardData) => {
                    await handleCreateProject({
                        title: wizardData.title,
                        start_date: wizardData.due_date || '',
                    } as CreateProjectFormData);
                }}
                onDismiss={actions.handleDismissWizard}
            />
        </div>
    );
}
