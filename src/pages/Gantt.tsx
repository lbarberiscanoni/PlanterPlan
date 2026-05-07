import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ViewMode } from 'gantt-task-react';
import { useProjectList } from '@/features/projects/hooks/useProjectList';
import { useProjectData } from '@/features/projects/hooks/useProjectData';
import { tasksToGanttRows } from '@/features/gantt/lib/gantt-adapter';
import { ProjectGantt, type GanttZoom } from '@/features/gantt/components/ProjectGantt';
import { useGanttDragShift } from '@/features/gantt/hooks/useGanttDragShift';
import { useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/select';
import { Label } from '@/shared/ui/label';

export default function Gantt() {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const projectId = searchParams.get('projectId');

    const { data: projectList } = useProjectList();
    const activeProjects = projectList.activeProjects;

    const [zoom, setZoom] = useState<GanttZoom>(ViewMode.Week);
    const [includeLeafTasks, setIncludeLeafTasks] = useState(false);

    const { projectHierarchy } = useProjectData(projectId);
    const hierarchyTasks = projectHierarchy;
    const updateTask = useUpdateTask();

    const { rows, skippedCount } = useMemo(
        () => tasksToGanttRows(hierarchyTasks, { includeLeafTasks }),
        [hierarchyTasks, includeLeafTasks],
    );

    const onShiftDates = useGanttDragShift({
        projectId: projectId ?? '',
        tasks: hierarchyTasks,
        updateTaskDates: updateTask.mutateAsync,
    });

    if (!projectId) {
        return (
            <div className="flex flex-col gap-4 p-6">
                <h1 className="text-2xl font-semibold text-slate-900">{t('projects.gantt.title')}</h1>
                <p className="text-sm text-slate-600">{t('projects.gantt.pick_project_subtitle')}</p>
                {activeProjects.length === 0 ? (
                    <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                        {t('projects.gantt.no_active_projects')}
                    </p>
                ) : (
                    <div className="flex items-center gap-2">
                        <Label htmlFor="gantt-project-picker" className="text-sm text-slate-600">{t('projects.gantt.project_picker_label')}</Label>
                        <Select
                            onValueChange={(id) => {
                                setSearchParams({ projectId: id });
                            }}
                        >
                            <SelectTrigger id="gantt-project-picker" className="w-80">
                                <SelectValue placeholder={t('projects.gantt.select_project')} />
                            </SelectTrigger>
                            <SelectContent>
                                {activeProjects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.title ?? t('projects.gantt.untitled_project')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-6">
            <h1 className="text-2xl font-semibold text-slate-900">{t('projects.gantt.title')}</h1>
            <ProjectGantt
                rows={rows}
                skippedCount={skippedCount}
                zoom={zoom}
                onZoomChange={setZoom}
                includeLeafTasks={includeLeafTasks}
                onIncludeLeafTasksChange={setIncludeLeafTasks}
                onShiftDates={onShiftDates}
            />
        </div>
    );
}
