import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { makeTask } from '@test/factories';
import { useProjectDnd } from '@/pages/hooks/useProjectDnd';
import type { TaskRow } from '@/shared/db/app.types';

const rows = [
    makeTask({ id: 'project', parent_task_id: null, task_type: 'project' }),
    makeTask({ id: 'phase', parent_task_id: 'project', task_type: 'phase' }),
    makeTask({ id: 'milestone', parent_task_id: 'phase', task_type: 'milestone' }),
    makeTask({ id: 'task-a', parent_task_id: 'milestone', task_type: 'task' }),
    makeTask({ id: 'task-b', parent_task_id: 'milestone', task_type: 'task' }),
    makeTask({ id: 'subtask-a', parent_task_id: 'task-b', task_type: 'subtask' }),
] as TaskRow[];

function startEvent(taskId: string): DragStartEvent {
    return { active: { id: taskId } } as DragStartEvent;
}

function containerOverEvent(activeId: string, parentId: string): DragOverEvent {
    return {
        active: { id: activeId },
        over: {
            id: `child-context-${parentId}`,
            data: { current: { type: 'container', parentId } },
        },
    } as DragOverEvent;
}

function containerEndEvent(activeId: string, parentId: string): DragEndEvent {
    return {
        active: { id: activeId },
        over: {
            id: `child-context-${parentId}`,
            data: { current: { type: 'container', parentId } },
        },
    } as DragEndEvent;
}

describe('useProjectDnd hierarchy guard', () => {
    it('rejects drops that would create children under subtasks', () => {
        const onTaskUpdate = vi.fn();
        const onToggleExpand = vi.fn();
        const onInvalidDrop = vi.fn();
        const { result } = renderHook(() => useProjectDnd(rows, onTaskUpdate, onToggleExpand, onInvalidDrop));

        act(() => result.current.handleDragStart(startEvent('task-a')));
        act(() => result.current.handleDragOver(containerOverEvent('task-a', 'subtask-a')));
        act(() => result.current.handleDragEnd(containerEndEvent('task-a', 'subtask-a')));

        expect(onInvalidDrop).toHaveBeenCalledTimes(1);
        expect(onTaskUpdate).not.toHaveBeenCalled();
        expect(onToggleExpand).not.toHaveBeenCalled();
    });

    it('allows valid childless task reparenting under another task', () => {
        const onTaskUpdate = vi.fn();
        const onToggleExpand = vi.fn();
        const onInvalidDrop = vi.fn();
        const { result } = renderHook(() => useProjectDnd(rows, onTaskUpdate, onToggleExpand, onInvalidDrop));

        act(() => result.current.handleDragStart(startEvent('task-a')));
        act(() => result.current.handleDragOver(containerOverEvent('task-a', 'task-b')));
        act(() => result.current.handleDragEnd(containerEndEvent('task-a', 'task-b')));

        expect(onInvalidDrop).not.toHaveBeenCalled();
        expect(onTaskUpdate).toHaveBeenCalledWith('task-a', { parent_task_id: 'task-b' });
        expect(onToggleExpand).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-b' }), true);
    });
});
