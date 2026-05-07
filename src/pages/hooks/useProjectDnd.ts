import { useState, useEffect, useRef } from 'react';
import { pointerWithin, closestCorners, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent, CollisionDetection } from '@dnd-kit/core';
import { POSITION_STEP } from '@/shared/constants';
import type { TaskRow } from '@/shared/db/app.types';
import { canReparentTask } from '@/features/tasks/lib/task-hierarchy';

export type DropIndicator = { parentId: string; beforeTaskId: string | null; nestInId?: string } | null;

export function useProjectDnd(
    tasks: TaskRow[],
    onTaskUpdate: (id: string, updates: Record<string, unknown>) => void,
    onToggleExpand: (task: TaskRow, expanded: boolean) => void,
    onInvalidDrop?: () => void,
) {
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null);
    const pointerYRef = useRef<number>(0);
    const invalidDropRef = useRef(false);

    useEffect(() => {
        const handler = (e: PointerEvent) => { pointerYRef.current = e.clientY; };
        window.addEventListener('pointermove', handler);
        return () => window.removeEventListener('pointermove', handler);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
        setDropIndicator(null);
        invalidDropRef.current = false;
    };

    const setValidDropIndicator = (indicator: NonNullable<DropIndicator>) => {
        invalidDropRef.current = false;
        setDropIndicator(indicator);
    };

    const rejectDropIndicator = () => {
        invalidDropRef.current = true;
        setDropIndicator(null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) {
            setDropIndicator(null);
            return;
        }
        if (active.id === over.id) {
            // Don't clear indicator — pointer may have crossed back over active task's original position
            return;
        }

        const overData = over.data.current;
        if (!overData) {
            setDropIndicator(null);
            return;
        }

        if (overData.type === 'Task') {
            const overTask = tasks.find(t => t.id === over.id);
            if (!overTask) return;

            // Use fresh DOM rect — dnd-kit's over.rect can be stale (doesn't track scroll)
            const overEl = document.querySelector(`[data-testid="task-row-${over.id}"]`);
            const overRect = overEl ? overEl.getBoundingClientRect() : over.rect;
            // Offset pointer by half the dragged task's height to approximate the visual center
            // (cursor stays at drag handle = top of card, but user perceives the card center as hover point)
            const activeEl = document.querySelector(`[data-testid="task-row-${active.id}"]`);
            const activeHeight = activeEl ? activeEl.getBoundingClientRect().height : 0;
            const pointerY = pointerYRef.current + activeHeight / 2;

            const parentId = overTask.parent_task_id || '';
            const siblings = tasks
                .filter(t => t.parent_task_id === parentId && t.id !== active.id)
                .sort((a, b) => (a.position || 0) - (b.position || 0));
            const overIndex = siblings.findIndex(t => t.id === over.id);

            const isWithinTask = pointerY >= overRect.top && pointerY <= overRect.top + overRect.height;

            if (isWithinTask) {
                const relativeY = (pointerY - overRect.top) / overRect.height;
                if (relativeY < 0.25) {
                    setValidDropIndicator({ parentId, beforeTaskId: overTask.id });
                } else if (relativeY > 0.75) {
                    const nextSibling = siblings[overIndex + 1];
                    setValidDropIndicator({ parentId, beforeTaskId: nextSibling?.id ?? null });
                } else {
                    const canNest = canReparentTask(active.id as string, overTask.id, tasks);
                    if (canNest) {
                        setValidDropIndicator({ parentId, beforeTaskId: null, nestInId: overTask.id });
                    } else {
                        rejectDropIndicator();
                    }
                }
            } else {
                const overMidY = overRect.top + overRect.height / 2;
                if (pointerY < overMidY) {
                    setValidDropIndicator({ parentId, beforeTaskId: overTask.id });
                } else {
                    const nextSibling = siblings[overIndex + 1];
                    setValidDropIndicator({ parentId, beforeTaskId: nextSibling?.id ?? null });
                }
            }
        } else if (overData.type === 'container' && overData.parentId) {
            const targetParentId = overData.parentId as string;
            if (canReparentTask(active.id as string, targetParentId, tasks)) {
                setValidDropIndicator({
                    parentId: targetParentId,
                    beforeTaskId: null,
                });
            } else {
                rejectDropIndicator();
            }
        } else {
            setDropIndicator(null);
        }
    };

    const collisionDetection: CollisionDetection = (args) => {
        const pointerCollisions = pointerWithin(args);
        const containerHits = pointerCollisions.filter(c => {
            const container = (args.droppableContainers as Array<{ id: string; data?: { current?: { type?: string } } }>).find(dc => dc.id === c.id);
            return container?.data?.current?.type === 'container';
        });

        const centerCollisions = closestCenter(args);

        const taskHits = centerCollisions.filter(c => {
            if (c.id === args.active.id) return false;
            const container = (args.droppableContainers as Array<{ id: string; data?: { current?: { type?: string } } }>).find(dc => dc.id === c.id);
            return container?.data?.current?.type !== 'container';
        });

        const combined = [...taskHits, ...containerHits];
        if (combined.length > 0) return combined;
        return closestCorners(args);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const savedIndicator = dropIndicator;
        const hadInvalidDrop = invalidDropRef.current;
        setActiveDragId(null);
        setDropIndicator(null);
        invalidDropRef.current = false;

        const { active, over } = event;
        if (!over) {
            if (hadInvalidDrop) onInvalidDrop?.();
            return;
        }
        if (active.id === over.id && !savedIndicator?.nestInId) return;

        const overData = over.data.current;
        const activeTask = tasks.find(t => t.id === active.id);
        if (!activeTask) return;
        if (!savedIndicator && hadInvalidDrop) {
            onInvalidDrop?.();
            return;
        }

        // Nest as subtask (middle zone drop)
        if (savedIndicator?.nestInId) {
            const nestTargetId = savedIndicator.nestInId;
            if (nestTargetId === active.id) return;
            if (!canReparentTask(active.id as string, nestTargetId, tasks)) {
                onInvalidDrop?.();
                return;
            }
            onTaskUpdate(active.id as string, { parent_task_id: nestTargetId });
            const nestTarget = tasks.find(t => t.id === nestTargetId);
            if (nestTarget) onToggleExpand(nestTarget, true);
            return;
        }

        if (!overData) return;

        // Container drop with different parent: reparent
        if (overData.type === 'container' && overData.parentId) {
            const targetParentId = overData.parentId as string;
            if (targetParentId === active.id) return;
            if (activeTask.parent_task_id !== targetParentId) {
                if (!canReparentTask(active.id as string, targetParentId, tasks)) {
                    onInvalidDrop?.();
                    return;
                }
                onTaskUpdate(active.id as string, { parent_task_id: targetParentId });
                const targetParent = tasks.find(t => t.id === targetParentId);
                if (targetParent) onToggleExpand(targetParent, true);
                return;
            }
        }

        // Use the dropIndicator to determine position
        if (savedIndicator) {
            const targetParentId = savedIndicator.parentId;
            const siblings = tasks
                .filter(t => t.parent_task_id === targetParentId && t.id !== active.id)
                .sort((a, b) => (a.position || 0) - (b.position || 0));

            let newPosition: number;

            if (savedIndicator.beforeTaskId) {
                const beforeTask = siblings.find(t => t.id === savedIndicator.beforeTaskId);
                const beforeIndex = siblings.findIndex(t => t.id === savedIndicator.beforeTaskId);
                const prevTask = beforeIndex > 0 ? siblings[beforeIndex - 1] : null;

                if (!prevTask) {
                    newPosition = (beforeTask?.position || 0) - POSITION_STEP;
                } else {
                    newPosition = Math.round(((prevTask.position || 0) + (beforeTask?.position || 0)) / 2);
                }
            } else {
                const lastTask = siblings[siblings.length - 1];
                newPosition = (lastTask?.position || 0) + POSITION_STEP;
            }

            const updates: Record<string, unknown> = { position: newPosition };
            if (activeTask.parent_task_id !== targetParentId) {
                if (!canReparentTask(active.id as string, targetParentId, tasks)) {
                    onInvalidDrop?.();
                    return;
                }
                updates.parent_task_id = targetParentId;
            }
            onTaskUpdate(active.id as string, updates);

            if (activeTask.parent_task_id !== targetParentId && targetParentId) {
                const targetParent = tasks.find(t => t.id === targetParentId);
                if (targetParent) onToggleExpand(targetParent, true);
            }
        }
    };

    return {
        activeDragId,
        dropIndicator,
        sensors,
        collisionDetection,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
    };
}
