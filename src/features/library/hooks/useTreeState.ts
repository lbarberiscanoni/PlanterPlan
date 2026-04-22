import { useState, useEffect, useCallback } from 'react';
import {
    mergeTaskUpdates,
    updateTreeExpansion,
    buildTree,
    mergeChildrenIntoTree,
    updateTaskInTree,
} from '@/shared/lib/tree-helpers';
import { planter } from '@/shared/api/planterClient';
import { POSITION_STEP } from '@/shared/constants';

import type { TaskItemData } from '@/shared/types/tasks';

export type TreeNode = TaskItemData;

interface UseTreeStateReturn {
    treeData: TreeNode[];
    loadingNodes: Record<string, boolean>;
    expandedTaskIds: Set<string>;
    toggleExpand: (task: TreeNode, expanded: boolean) => Promise<void>;
    handleStatusChange: (taskId: string, newStatus: string) => Promise<void>;
    handleReorder: (activeId: string, overId: string) => Promise<void>;
}

export const useTreeState = (rootTasks: TreeNode[]): UseTreeStateReturn => {
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [loadingNodes, setLoadingNodes] = useState<Record<string, boolean>>({});
    const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

    // Effect 1: Handle data updates from props. Hook owns mutable tree state
    // (reorders, status changes, lazily-loaded children) so we can't derive via useMemo.
    useEffect(() => {
        if (rootTasks && rootTasks.length > 0) {
            setTreeData(mergeTaskUpdates(rootTasks));
        } else if (rootTasks) {
            setTreeData([]);
        }
    }, [rootTasks]);

    // Effect 2: Sync persistent expansion state onto the tree. Same rationale as above.
    useEffect(() => {
        setTreeData((prevTree) => updateTreeExpansion(prevTree, expandedTaskIds));
    }, [expandedTaskIds]);

    const toggleExpand = useCallback(
        async (task: TreeNode, expanded: boolean) => {
            setExpandedTaskIds((prev) => {
                const next = new Set(prev);
                if (expanded) next.add(task.id);
                else next.delete(task.id);
                return next;
            });

            if (expanded && (!task.children || task.children.length === 0) && !loadingNodes[task.id]) {
                setLoadingNodes((prev) => ({ ...prev, [task.id]: true }));
                try {
                    const { data: children, error } = await planter.entities.Task.fetchChildren(task.id);
                    if (error) throw error;
                    const rawDescendants = (children as TaskItemData[]).filter((c) => c.id !== task.id);
                    const nestedChildren = buildTree(rawDescendants, task.id);

                    setTreeData((prev) => mergeChildrenIntoTree(prev, task.id, nestedChildren));
                } catch (err) {
                    console.error('Failed to load children', err);
                } finally {
                    setLoadingNodes((prev) => ({ ...prev, [task.id]: false }));
                }
            }
        },
        [loadingNodes]
    );

    const handleStatusChange = useCallback(async (taskId: string, newStatus: string) => {
        let previousStatus: string | null | undefined;
        setTreeData((prev) => {
            const findTask = (nodes: TreeNode[]): TreeNode | null => {
                for (const node of nodes) {
                    if (node.id === taskId) return node;
                    if (node.children) {
                        const found = findTask(node.children);
                        if (found) return found;
                    }
                }
                return null;
            };

            const task = findTask(prev);
            if (task) previousStatus = task.status;

            return updateTaskInTree(prev, taskId, { status: newStatus });
        });

        try {
            const { error } = await planter.entities.Task.updateStatus(taskId, newStatus);
            if (error) throw error;
        } catch (err) {
            console.error('Failed to update status', err);
            if (previousStatus) {
                setTreeData((prev) => updateTaskInTree(prev, taskId, { status: previousStatus }));
            }
        }
    }, []);

    const handleReorder = useCallback(async (activeId: string, overId: string) => {
        if (activeId === overId) return;

        const findNodeAndSiblings = (
            nodes: TreeNode[],
            targetId: string,
            parent: TreeNode | null = null
        ): { node: TreeNode; siblings: TreeNode[]; index: number; parent: TreeNode | null } | null => {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].id === targetId) {
                    const node = { ...nodes[i], project_id: nodes[i].project_id ?? undefined };
                    return { node, siblings: nodes, index: i, parent };
                }
                if (nodes[i].children) {
                    const result = findNodeAndSiblings(nodes[i].children!, targetId, nodes[i]);
                    if (result) return result;
                }
            }
            return null;
        };

        setTreeData((prevTree) => {
            const activeData = findNodeAndSiblings(prevTree, activeId);
            const overData = findNodeAndSiblings(prevTree, overId);

            if (!activeData || !overData) return prevTree;

            if (activeData.parent?.id !== overData.parent?.id) {
                console.warn('Reparenting drag not yet supported via this simple reorder');
                return prevTree;
            }

            const siblings = overData.siblings;
            const overIndex = overData.index;

            let newPosition: number;
            const isMovingDown = activeData.index < overData.index;

            if (isMovingDown) {
                const afterPos = siblings[overIndex].position || 0;
                const nextSibling = siblings[overIndex + 1];
                const nextPos = nextSibling ? (nextSibling.position || afterPos + POSITION_STEP * 2) : (afterPos + POSITION_STEP);
                newPosition = (afterPos + nextPos) / 2;
            } else {
                const beforePos = siblings[overIndex].position || 0;
                const prevSibling = siblings[overIndex - 1];
                const prevPos = prevSibling ? (prevSibling.position || beforePos - POSITION_STEP * 2) : (beforePos - POSITION_STEP);
                newPosition = (prevPos + beforePos) / 2;
            }

            planter.entities.Task.update(activeId, { position: newPosition, parent_task_id: activeData.parent?.id })
                .catch((err: unknown) => {
                    console.error('Reorder failed', err);
                });

            return updateTaskInTree(prevTree, activeId, { position: newPosition });
        });
    }, []);

    return {
        treeData,
        loadingNodes,
        expandedTaskIds,
        toggleExpand,
        handleStatusChange,
        handleReorder,
    };
};
