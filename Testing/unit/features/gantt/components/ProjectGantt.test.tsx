import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Task as GanttTaskApiType } from 'gantt-task-react';
import { mockGanttLib } from '@test/mocks/gantt';

vi.mock('gantt-task-react', () => mockGanttLib());

// The library imports its CSS; stub the import so jsdom doesn't choke.
vi.mock('gantt-task-react/dist/index.css', () => ({}));

import { ProjectGantt } from '@/features/gantt/components/ProjectGantt';

function makeRow(overrides: Partial<GanttTaskApiType> & { id: string }): GanttTaskApiType {
    return {
        id: overrides.id,
        type: overrides.type ?? 'task',
        name: overrides.name ?? 'Row',
        start: overrides.start ?? new Date('2026-01-01'),
        end: overrides.end ?? new Date('2026-01-05'),
        progress: overrides.progress ?? 0,
    } as GanttTaskApiType;
}

describe('ProjectGantt (Wave 28)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the "no tasks" copy when rows are empty', () => {
        render(
            <ProjectGantt
                rows={[]}
                skippedCount={0}
                zoom={'Week' as const}
                onZoomChange={() => {}}
                includeLeafTasks={false}
                onIncludeLeafTasksChange={() => {}}
            />,
        );
        expect(screen.getByText(/no tasks with scheduled dates yet/i)).toBeInTheDocument();
    });

    it('shows skippedCount banner when > 0', () => {
        render(
            <ProjectGantt
                rows={[makeRow({ id: 'a' })]}
                skippedCount={3}
                zoom={'Week' as const}
                onZoomChange={() => {}}
                includeLeafTasks={false}
                onIncludeLeafTasksChange={() => {}}
            />,
        );
        expect(screen.getByText(/3 tasks excluded/i)).toBeInTheDocument();
    });

    it('renders the Export PDF button wired to window.print()', () => {
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
        render(
            <ProjectGantt
                rows={[]}
                skippedCount={0}
                zoom={'Week' as const}
                onZoomChange={() => {}}
                includeLeafTasks={false}
                onIncludeLeafTasksChange={() => {}}
            />,
        );
        const pdfBtn = screen.getByRole('button', { name: /export gantt via browser print dialog/i });
        expect(pdfBtn).toBeEnabled();
        pdfBtn.click();
        expect(printSpy).toHaveBeenCalledTimes(1);
        printSpy.mockRestore();
    });

    it('fires onIncludeLeafTasksChange when the switch is toggled', () => {
        const onToggle = vi.fn();
        render(
            <ProjectGantt
                rows={[]}
                skippedCount={0}
                zoom={'Week' as const}
                onZoomChange={() => {}}
                includeLeafTasks={false}
                onIncludeLeafTasksChange={onToggle}
            />,
        );
        fireEvent.click(screen.getByRole('switch'));
        expect(onToggle).toHaveBeenCalledWith(true);
    });
});
