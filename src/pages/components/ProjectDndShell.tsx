import { createPortal } from 'react-dom';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useProjectDnd } from '@/pages/hooks/useProjectDnd';
import type { DropIndicator } from '@/pages/hooks/useProjectDnd';
import type { TaskRow } from '@/shared/db/app.types';

interface Props {
    tasks: TaskRow[];
    onTaskUpdate: (id: string, updates: Record<string, unknown>) => void;
    onToggleExpand: (task: TaskRow, expanded: boolean) => void;
    onInvalidDrop?: () => void;
    children: (dropIndicator: DropIndicator) => React.ReactNode;
}

export function ProjectDndShell({ tasks, onTaskUpdate, onToggleExpand, onInvalidDrop, children }: Props) {
    const {
        activeDragId,
        dropIndicator,
        sensors,
        collisionDetection,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
    } = useProjectDnd(tasks, onTaskUpdate, onToggleExpand, onInvalidDrop);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            {children(dropIndicator)}
            {createPortal(
                <DragOverlay dropAnimation={null}>
                    {activeDragId && (() => {
                        const draggedTask = tasks.find(t => t.id === activeDragId);
                        if (!draggedTask) return null;
                        return (
                            <div className="bg-white border border-brand-200 rounded-xl px-4 py-3 shadow-xl cursor-grabbing max-w-md">
                                <p className="text-sm font-medium text-slate-900 truncate">{draggedTask.title}</p>
                            </div>
                        );
                    })()}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}
