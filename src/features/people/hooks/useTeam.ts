import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import type { Task as ProjectRow, TeamMemberWithProfile } from '@/shared/db/app.types';

export function useTeam(projectId: string | null) {
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const { data: project, isLoading: isLoadingProject, error: projectError } = useQuery<ProjectRow | null>({
        queryKey: ['teamProject', projectId],
        queryFn: () => planter.entities.Project.get(projectId!).then(res => res as ProjectRow | null),
        enabled: !!projectId,
    });

    const isInstanceProjectRoot = project?.origin === 'instance' && project.parent_task_id === null;

    const { data: teamMembers = [], isLoading: isLoadingMembers, error: teamError } = useQuery<TeamMemberWithProfile[]>({
        queryKey: ['teamMembers', projectId],
        queryFn: () => planter.entities.TeamMember.listByProjectWithProfiles(projectId!),
        enabled: !!projectId && isInstanceProjectRoot,
    });

    const deleteMemberMutation = useMutation({
        mutationFn: (id: string) => planter.entities.TeamMember.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teamMembers', projectId] });
            toast.success(t('projects.team_page.remove_success'));
        },
        onError: (error: Error) => {
            toast.error(t('projects.team_page.remove_failed'), { description: error.message });
        },
    });

    const inviteMemberMutation = useMutation({
        mutationFn: (data: { project_id: string | null, name: string, email: string, role: string }) => {
            const targetProjectId = data.project_id ?? projectId;
            if (!targetProjectId) throw new Error(t('projects.team_page.project_required'));
            return planter.entities.Project.inviteMemberByEmail(targetProjectId, data.email, data.role);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teamMembers', projectId] });
            toast.success(t('projects.invite_modal.success'));
        },
    });

    return {
        project,
        teamMembers,
        isLoading: isLoadingProject || isLoadingMembers,
        error: (projectError as Error | null) ?? (teamError as Error | null) ?? null,
        mutations: {
            deleteMember: deleteMemberMutation,
            addMember: inviteMemberMutation,
            inviteMember: inviteMemberMutation,
        }
    };
}
