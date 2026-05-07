import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';
import { useConfirm } from '@/shared/ui/confirm-dialog-context';
import type { JsonObject, TaskInsert, TaskRow, TaskUpdate } from '@/shared/db/app.types';

export interface ProjectBoardTaskActions {
    /**
     * Requires root_id so the task mutation can stay scoped to the project
     * hierarchy cache and the server-side RLS authorization context.
     */
    updateTask: (
        payload: { id: string; root_id: string } & Partial<TaskUpdate>,
        options?: { onError?: (error: Error) => void },
    ) => void;
    createTask: (payload: TaskInsert) => Promise<unknown>;
    deleteTask: (
        payload: { id: string; root_id?: string | null },
        options?: { onSuccess?: () => void; onError?: (error: Error) => void },
    ) => void;
}

/**
 * Copies only behavior flags that project instances may inherit as read-only behavior.
 *
 * @param settings - Source template settings JSON from the imported library row.
 * @returns A sanitized settings object for the project task insert, or `undefined` when empty.
 */
function copyTemplateBehaviorSettings(settings: TaskRow['settings']): JsonObject | undefined {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return undefined;
    }

    const source = settings as Record<string, unknown>;
    const next: JsonObject = {};

    if (source.is_coaching_task === true) {
        next.is_coaching_task = true;
    }
    if (source.is_strategy_template === true) {
        next.is_strategy_template = true;
    }

    return Object.keys(next).length > 0 ? next : undefined;
}

export function useProjectBoard(
    projectId: string | undefined,
    tasks: TaskRow[] = [],
    taskActions: ProjectBoardTaskActions,
) {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const [activeTab, setActiveTab] = useState('board');
    const [selectedPhase, setSelectedPhase] = useState<TaskRow | null>(null);
    const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
    const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
    const [inlineAddingParentId, setInlineAddingParentId] = useState<string | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);

    const handleTaskUpdate = (taskId: string, data: Partial<TaskUpdate>) => {
        if (!projectId) {
            toast.error(t('errors.project_not_found_or_no_access'));
            return;
        }

        taskActions.updateTask({ id: taskId, ...data, root_id: projectId }, {
            onError: (error: Error) => {
                toast.error(t('projects.task_update_failed_toast'), { description: error.message });
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
        const inheritedSettings = copyTemplateBehaviorSettings(templateData?.settings ?? null);

        try {
            await taskActions.createTask({
                title,
                root_id: projectId,
                is_complete: false,
                parent_task_id: parentId,
                origin: 'instance',
                priority: 'medium',
                description: templateData?.description ?? '',
                notes: null,
                purpose: templateData?.purpose ?? '',
                actions: templateData?.actions ?? '',
                ...(inheritedSettings ? { settings: inheritedSettings } : {}),
            });
            setInlineAddingParentId(null);
        } catch {
            toast.error(t('projects.task_create_failed_toast'));
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
        taskActions.deleteTask({ id: task.id, root_id: projectId }, {
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
