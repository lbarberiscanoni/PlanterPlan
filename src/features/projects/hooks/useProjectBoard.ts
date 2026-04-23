import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateTask, useUpdateTask, useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';

import { toast } from 'sonner';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import type { TaskRow, TaskUpdate } from '@/shared/db/app.types';

export function useProjectBoard(projectId: string | undefined, tasks: TaskRow[] = []) {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const [activeTab, setActiveTab] = useState('board');
    const [selectedPhase, setSelectedPhase] = useState<TaskRow | null>(null);
    const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
    const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
    const [inlineAddingParentId, setInlineAddingParentId] = useState<string | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);

    const _updateTask = useUpdateTask();
    const _deleteTask = useDeleteTask();
    const _createTask = useCreateTask();

    const handleTaskUpdate = (taskId: string, data: Partial<TaskUpdate>) => {
        _updateTask.mutate({ id: taskId, ...data, root_id: projectId }, {
            onError: (error: Error) => {
                toast.error('Failed to update task', { description: error.message });
            }
        });
    };

    const handleTaskClick = (task: TaskRow) => setSelectedTask(task);

    const handleToggleExpand = (task: TaskRow, isExpanded: boolean) => {
        setExpandedTaskIds((prev) => {
            const newSet = new Set(prev);
            if (isExpanded) newSet.add(task.id);
            else newSet.delete(task.id);
            return newSet;
        });
    };

    const mapTaskWithState = (task: TaskRow): Record<string, unknown> => {
        const visited = new Set<string>();
        const buildNode = (t: TaskRow): Record<string, unknown> => {
            if (visited.has(t.id)) return { ...t, children: [] };
            visited.add(t.id);
            return {
                ...t,
                isExpanded: expandedTaskIds.has(t.id) || inlineAddingParentId === t.id,
                isAddingInline: inlineAddingParentId === t.id,
                children: tasks
                    .filter((c) => c.parent_task_id === t.id && c.id !== t.id)
                    .map(buildNode)
                    .sort((a, b) => ((a as TaskRow).position || 0) - ((b as TaskRow).position || 0)),
            };
        };
        return buildNode(task);
    };

    const handleStartInlineAdd = (parentTask: TaskRow) => {
        setInlineAddingParentId(parentTask.id);
        setExpandedTaskIds((prev) => new Set(prev).add(parentTask.id));
    };

    const handleInlineCommit = async (parentId: string, title: string, templateData?: Partial<TaskRow>) => {
        try {
            await _createTask.mutateAsync({
                title,
                root_id: projectId,
                is_complete: false,
                parent_task_id: parentId,
                origin: 'instance',
                priority: 'medium',
                description: templateData?.description ?? '',
                notes: templateData?.notes ?? '',
                purpose: templateData?.purpose ?? '',
                actions: templateData?.actions ?? '',
            });
            setInlineAddingParentId(null);
        } catch {
            toast.error('Failed to create task');
        }
    };

    const handleDeleteTask = async (task: TaskRow) => {
        const ok = await confirm({
            title: t('tasks.delete_confirm_title', { title: task.title || t('common.untitled_task') }),
            description: t('tasks.delete_confirm_description'),
            confirmText: t('common.delete'),
            destructive: true,
        });
        if (!ok) return;
        _deleteTask.mutate({ id: task.id, root_id: projectId }, {
            onSuccess: () => {
                setSelectedTask(null);
                toast.success(t('tasks.delete_success'));
            },
            onError: (error: Error) => toast.error(t('tasks.delete_failure'), { description: error.message })
        });
    };

    return {
        state: {
            activeTab, selectedPhase, selectedTask, showInviteModal, inlineAddingParentId
        },
        actions: {
            setActiveTab, setSelectedPhase, setSelectedTask, setShowInviteModal, setInlineAddingParentId
        },
        handlers: {
            handleTaskUpdate, handleTaskClick, handleToggleExpand,
            handleStartInlineAdd, handleInlineCommit, handleDeleteTask
        },
        computed: {
            mapTaskWithState
        }
    };
}
