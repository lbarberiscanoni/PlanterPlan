import { useMemo } from 'react';
import ProjectSwitcher from '@/features/projects/components/ProjectSwitcher';
import { useTaskQuery } from '@/features/tasks/hooks/useTaskQuery';
import type { Project, Task } from '@/shared/db/app.types';

export default function ProjectSwitcherContainer() {
    const { tasks = [], projectsLoading } = useTaskQuery();
    const instanceProjects = useMemo(
        () => tasks.filter((task) => task.origin === 'instance') as Array<Project | Task>,
        [tasks],
    );

    return (
        <ProjectSwitcher
            projects={instanceProjects}
            projectsLoading={projectsLoading}
        />
    );
}
