import { useCallback, useRef } from 'react';
import { Gantt as GanttLib, type Task as GanttTaskApiType, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { Calendar, FileDown } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import { Label } from '@/shared/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/select';
import type { OnShiftDates } from '@/features/gantt/hooks/useGanttDragShift';

export type GanttZoom = typeof ViewMode.Day | typeof ViewMode.Week | typeof ViewMode.Month;

export interface ProjectGanttProps {
    rows: GanttTaskApiType[];
    skippedCount: number;
    zoom: GanttZoom;
    onZoomChange: (zoom: GanttZoom) => void;
    includeLeafTasks: boolean;
    onIncludeLeafTasksChange: (include: boolean) => void;
    onShiftDates?: OnShiftDates;
}

/**
 * Thin wrapper around `gantt-task-react`. The toolbar lives here but reads its
 * state from props so `<Gantt>` (the page) owns the truth. Fires `onShiftDates`
 * after translating the library's `(task, children)` callback to
 * `(taskId, newStart, newEnd)` — bounds + persistence live in the hook.
 */
export function ProjectGantt({
    rows,
    skippedCount,
    zoom,
    onZoomChange,
    includeLeafTasks,
    onIncludeLeafTasksChange,
    onShiftDates,
}: ProjectGanttProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleDateChange = useCallback(
        async (task: GanttTaskApiType) => {
            if (!onShiftDates) return;
            await onShiftDates(task.id, task.start, task.end);
        },
        [onShiftDates],
    );

    const handleTodayClick = useCallback(() => {
        // gantt-task-react doesn't expose a "jump to today" API — the library always
        // renders around `min(tasks.start)`. The chart scroll position is owned by
        // the library's internal state; the best we can do is nudge the user back
        // to the leftmost column. If the library ever gains a ref-based scroll API,
        // route it here.
        containerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
    }, []);

    return (
        <div data-testid="project-gantt" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                    <Label htmlFor="gantt-zoom" className="text-sm text-slate-600">Zoom</Label>
                    <Select value={zoom} onValueChange={(v) => onZoomChange(v as GanttZoom)}>
                        <SelectTrigger id="gantt-zoom" className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ViewMode.Day}>Day</SelectItem>
                            <SelectItem value={ViewMode.Week}>Week</SelectItem>
                            <SelectItem value={ViewMode.Month}>Month</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button variant="outline" size="sm" onClick={handleTodayClick}>
                    <Calendar aria-hidden="true" />
                    Today
                </Button>

                <div className="flex items-center gap-2">
                    <Switch
                        id="gantt-include-leaves"
                        checked={includeLeafTasks}
                        onCheckedChange={onIncludeLeafTasksChange}
                    />
                    <Label htmlFor="gantt-include-leaves" className="text-sm text-slate-600">
                        Include leaf tasks
                    </Label>
                </div>

                <div className="ml-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                        aria-label="Export gantt via browser print dialog (choose 'Save as PDF' as the destination)"
                    >
                        <FileDown aria-hidden="true" />
                        Export PDF
                    </Button>
                </div>
            </div>

            {skippedCount > 0 ? (
                <p className="text-sm text-slate-600" role="status">
                    {skippedCount} task{skippedCount === 1 ? '' : 's'} excluded (missing dates).
                </p>
            ) : null}

            {rows.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
                    This project has no tasks with scheduled dates yet.
                </p>
            ) : (
                <div
                    ref={containerRef}
                    className="gantt-container overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
                >
                    <GanttLib
                        tasks={rows}
                        viewMode={zoom}
                        onDateChange={onShiftDates ? handleDateChange : undefined}
                        /* Empty string hides the library's built-in task-list column
                         * (lib reads `if (!listCellWidth)`); the app already has
                         * TaskList elsewhere, so keep the gantt bars-only. */
                        listCellWidth=""
                    />
                </div>
            )}
        </div>
    );
}
