import { useMemo } from 'react';
import ProjectSwitcher from '@/features/projects/components/ProjectSwitcher';
import { useTaskQuery } from '@/features/tasks/hooks/useTaskQuery';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { PROJECT_STATUS } from '@/shared/constants/domain';
import type { Project, Task } from '@/shared/db/app.types';

export default function ProjectSwitcherContainer() {
    const { tasks = [], joinedProjects = [], projectsLoading } = useTaskQuery();

    // The single global project selector: projects the user owns PLUS projects
    // they were invited to (project_members). Previously owner-only, which hid
    // invited projects from the switcher entirely.
    const instanceProjects = useMemo(
        () => [
            ...tasks.filter((task) => task.origin === 'instance'),
            ...(joinedProjects as Array<Project | Task>),
        ] as Array<Project | Task>,
        [tasks, joinedProjects],
    );

    // Options that back the persisted-focus resolution: active instances only
    // (mirror the switcher's own "Active Projects" default section + Home).
    const focusOptions = useMemo(
        () => instanceProjects
            .filter((p) => p.status !== PROJECT_STATUS.ARCHIVED && !p.is_complete)
            .map((p) => ({ id: p.id, title: p.title ?? undefined })),
        [instanceProjects],
    );

    // The header switcher is the single authoritative source of the current
    // project: persist its resolved default so Home / Tasks converge on the same
    // id rather than each falling back to its own first project.
    const { currentProjectId, setCurrentProjectId } = useCurrentProject(focusOptions, { persistDefault: true });

    return (
        <ProjectSwitcher
            projects={instanceProjects}
            projectsLoading={projectsLoading}
            currentProjectId={currentProjectId}
            onSelectProject={setCurrentProjectId}
        />
    );
}
