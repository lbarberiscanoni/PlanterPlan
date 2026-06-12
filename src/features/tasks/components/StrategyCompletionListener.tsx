import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onStrategyTaskCompleted } from '@/shared/lib/strategy-completion-bus';
import { collectSpawnedTemplateIds } from '@/shared/lib/tree-helpers';
import type { Task, TaskRow } from '@/shared/db/app.types';
import StrategyFollowUpDialog from '@/features/tasks/components/StrategyFollowUpDialog';

/**
 * App-level singleton that listens for strategy-template task completions
 * emitted by `planterClient.updateStatus`. Because that client method is the
 * universal status chokepoint, this fires no matter which surface completed the
 * task — the /tasks status pill, the project board, drag-and-drop, or the
 * details panel — without each surface having to wire the dialog itself.
 */
export default function StrategyCompletionListener() {
    const queryClient = useQueryClient();
    const [task, setTask] = useState<Task | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => onStrategyTaskCompleted((completed) => {
        setTask(completed);
        setOpen(true);
    }), []);

    // Hide templates already cloned into this project (Wave 22 dedupe). Reads the
    // already-cached project hierarchy — no extra fetch — and tolerates a miss.
    const excludeTemplateIds = useMemo(() => {
        if (!task) return [];
        const rootId = task.root_id ?? task.id;
        const hierarchy = queryClient.getQueryData<TaskRow[]>(['projectHierarchy', rootId]);
        if (!hierarchy) return [];
        return Array.from(collectSpawnedTemplateIds(hierarchy));
    }, [task, queryClient]);

    if (!task) return null;

    return (
        <StrategyFollowUpDialog
            task={task as unknown as TaskRow}
            open={open}
            onOpenChange={setOpen}
            excludeTemplateIds={excludeTemplateIds}
        />
    );
}
