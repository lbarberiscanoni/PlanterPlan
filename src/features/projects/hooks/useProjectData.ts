import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { planter } from '@/shared/api/planterClient';
import { STALE_TIMES } from '@/shared/lib/react-query-config';

/** Minimal task shape returned by the project hierarchy query. */
interface HierarchyTask {
    id: string;
    parent_task_id?: string | null;
    root_id?: string | null;
    position?: number | null;
    [key: string]: unknown;
}

/** Team member shape returned by the team query. */
interface TeamMember {
    id: string;
    project_id: string;
    user_id: string;
    role?: string;
    [key: string]: unknown;
}

/** Project metadata shape. */
interface Project {
    id: string;
    title?: string;
    status?: string;
    [key: string]: unknown;
}

interface UseProjectDataReturn {
    project: Project | undefined;
    loadingProject: boolean;
    projectHierarchy: HierarchyTask[];
    phases: HierarchyTask[];
    milestones: HierarchyTask[];
    tasks: HierarchyTask[];
    teamMembers: TeamMember[];
}

/**
 * Hook to fetch project metadata, hierarchy (phases/milestones/tasks), and team members.
 */
export function useProjectData(projectId: string | null | undefined): UseProjectDataReturn {
    // 1. Fetch Project Metadata & Hierarchy Stats
    const { data, isLoading: loadingMetadata } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => planter.entities.Project.getWithStats(projectId!),
        enabled: !!projectId,
        staleTime: STALE_TIMES.long, // 5 minutes cache
    });

    const project = (data as { data?: Project } | undefined)?.data;

    // 2. Fetch Full Project Hierarchy
    const { data: projectHierarchy = [] } = useQuery<HierarchyTask[]>({
        queryKey: ['projectHierarchy', projectId],
        queryFn: () => planter.entities.Task.filter({ root_id: projectId }) as Promise<HierarchyTask[]>,
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
    const { data: teamMembers = [] } = useQuery<TeamMember[]>({
        queryKey: ['teamMembers', projectId],
        queryFn: () => planter.entities.TeamMember.filter({ project_id: projectId }),
        enabled: !!projectId,
    });

    return {
        project,
        loadingProject: loadingMetadata,
        projectHierarchy,
        phases,
        milestones,
        tasks,
        teamMembers,
    };
}
