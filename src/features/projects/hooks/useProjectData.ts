import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { planter } from '@/shared/api/planterClient';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import type { HierarchyTask, Project, TeamMemberWithProfile } from '@/shared/db/app.types';

interface UseProjectDataReturn {
    project: Project | undefined;
    loadingProject: boolean;
    /** True iff the primary project-metadata query errored (RLS denial, bad id, network). */
    projectError: Error | null;
    projectHierarchy: HierarchyTask[];
    phases: HierarchyTask[];
    milestones: HierarchyTask[];
    tasks: HierarchyTask[];
    teamMembers: TeamMemberWithProfile[];
    /** Manually retry the failed project-metadata query (used by the error-card CTA). */
    refetchProject: () => void;
}

/**
 * Hook to fetch project metadata, hierarchy (phases/milestones/tasks), and team members.
 */
export function useProjectData(projectId: string | null | undefined): UseProjectDataReturn {
    // 1. Fetch Project Metadata & Hierarchy Stats
    const {
        data,
        isLoading: loadingMetadata,
        error: projectError,
        refetch: refetchProject,
    } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => planter.entities.Project.getWithStats(projectId!),
        enabled: !!projectId,
        staleTime: STALE_TIMES.long, // 5 minutes cache
    });

    const project = data?.data;

    // 2. Fetch Full Project Hierarchy
    const { data: projectHierarchy = [] } = useQuery<HierarchyTask[]>({
        queryKey: ['projectHierarchy', projectId],
        queryFn: () => planter.entities.Task.filter({ root_id: projectId! }),
        enabled: !!projectId,
        staleTime: STALE_TIMES.long,
    });

    // Derived State
    const { phases, milestones, tasks } = useMemo(() => {
        const phaseIds = new Set<string>();
        const _phases: HierarchyTask[] = [];
        const _milestones: HierarchyTask[] = [];
        const _tasks: HierarchyTask[] = [];

        for (const t of projectHierarchy) {
            if (t.parent_task_id === projectId) {
                phaseIds.add(t.id);
                _phases.push(t);
            }
        }

        for (const t of projectHierarchy) {
            if (t.parent_task_id !== projectId) {
                if (phaseIds.has(t.parent_task_id!)) {
                    _milestones.push(t);
                } else {
                    _tasks.push(t);
                }
            }
        }

        return { phases: _phases, milestones: _milestones, tasks: _tasks };
    }, [projectHierarchy, projectId]);

    // 3. Fetch Team Members
    const { data: teamMembers = [] } = useQuery<TeamMemberWithProfile[]>({
        queryKey: ['teamMembers', projectId],
        queryFn: () => planter.entities.TeamMember.listByProjectWithProfiles(projectId!),
        enabled: !!projectId,
        staleTime: STALE_TIMES.medium,
    });

    return {
        project,
        loadingProject: loadingMetadata,
        projectError: (projectError as Error | null) ?? null,
        projectHierarchy,
        phases,
        milestones,
        tasks,
        teamMembers,
        refetchProject: () => { void refetchProject(); },
    };
}
