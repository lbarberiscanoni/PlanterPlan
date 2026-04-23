import { useCallback, useMemo, useRef } from 'react';
import { Gantt as GanttLib, type Task as GanttTaskApiType, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { Calendar, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { diffInCalendarDays, getNow, isBeforeDate } from '@/shared/lib/date-engine';
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
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);

    const handleDateChange = useCallback(
        async (task: GanttTaskApiType) => {
            if (!onShiftDates) return;
            await onShiftDates(task.id, task.start, task.end);
        },
        [onShiftDates],
    );

    // Compute once per `rows` change — avoids re-filtering + re-reducing the
    // whole row set on every render. Uses `Date` comparison directly (rows
    // carry native `Date` objects from the library) so no raw millisecond
    // math leaks in.
    const earliestStart = useMemo<Date | null>(
        () =>
            rows
                .map((r) => r.start)
                .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
                .reduce<Date | null>((min, d) => (min === null || d < min ? d : min), null),
        [rows],
    );

    const handleTodayClick = useCallback(() => {
        // gantt-task-react doesn't expose a "jump to today" API and renders
        // starting at `min(rows.start)`. Compute the horizontal offset to
        // today's column based on zoom-mode column width and the number of
        // days between the earliest task start and today — then scroll
        // directly to that offset. Falls back to leftmost scroll if the
        // container isn't mounted or we can't compute a valid offset. All
        // date logic routes through date-engine (no raw `new Date()` or
        // millisecond math at call site).
        const container = containerRef.current;
        if (!container) return;

        const today = getNow();

        if (!earliestStart || isBeforeDate(today, earliestStart)) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
            return;
        }

        // gantt-task-react's column widths are set by the library's default
        // stylesheet (see `gantt-task-react/dist/index.css`). These match
        // the library's internal defaults at the three zoom levels we use.
        const columnWidthByZoom: Record<GanttZoom, number> = {
            [ViewMode.Day]: 65,
            [ViewMode.Week]: 250,
            [ViewMode.Month]: 300,
        };
        const daysPerColumn: Record<GanttZoom, number> = {
            [ViewMode.Day]: 1,
            [ViewMode.Week]: 7,
            [ViewMode.Month]: 30,
        };
        const deltaDays = Math.max(0, diffInCalendarDays(today, earliestStart) ?? 0);
        const columns = deltaDays / (daysPerColumn[zoom] || 1);
        const targetLeft = Math.max(
            0,
            columns * (columnWidthByZoom[zoom] || 65) - container.clientWidth / 2,
        );
        container.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }, [earliestStart, zoom]);

    return (
        <div data-testid="project-gantt" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                    <Label htmlFor="gantt-zoom" className="text-sm text-slate-600">{t('gantt.zoom_label')}</Label>
                    <Select value={zoom} onValueChange={(v) => onZoomChange(v as GanttZoom)}>
                        <SelectTrigger id="gantt-zoom" className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ViewMode.Day}>{t('gantt.zoom_day')}</SelectItem>
                            <SelectItem value={ViewMode.Week}>{t('gantt.zoom_week')}</SelectItem>
                            <SelectItem value={ViewMode.Month}>{t('gantt.zoom_month')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button variant="outline" size="sm" onClick={handleTodayClick}>
                    <Calendar aria-hidden="true" />
                    {t('gantt.today')}
                </Button>

                <div className="flex items-center gap-2">
                    <Switch
                        id="gantt-include-leaves"
                        checked={includeLeafTasks}
                        onCheckedChange={onIncludeLeafTasksChange}
                    />
                    <Label htmlFor="gantt-include-leaves" className="text-sm text-slate-600">
                        {t('gantt.include_leaf_tasks')}
                    </Label>
                </div>

                <div className="ml-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                        aria-label={t('gantt.export_pdf_aria')}
                    >
                        <FileDown aria-hidden="true" />
                        {t('gantt.export_pdf')}
                    </Button>
                </div>
            </div>

            {skippedCount > 0 ? (
                <p className="text-sm text-slate-600" role="status">
                    {t('gantt.tasks_excluded', { count: skippedCount })}
                </p>
            ) : null}

            {rows.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
                    {t('gantt.no_scheduled_tasks')}
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
