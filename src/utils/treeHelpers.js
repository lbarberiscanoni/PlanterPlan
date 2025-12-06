/**
 * Deep clones a task tree, regenerating IDs and preserving structure.
 * 
 * @param {Object} rootTask - The root task object to clone.
 * @param {Function} fetchChildrenFn - Async function to fetch children for a given task ID. 
 *                                     Should return an array of task objects.
 * @param {Function} idGeneratorFn - Function to generate new IDs (e.g. crypto.randomUUID).
 * @returns {Promise<Object>} - The cloned task tree with new IDs and 'children' arrays populated.
 */
export const deepCloneTaskTree = async (rootTask, fetchChildrenFn, idGeneratorFn) => {
    if (!rootTask) return null;

    // 1. Create a map to store oldId -> newId mappings
    const idMap = new Map();

    // 2. Helper to clone a single node (without children yet)
    const cloneNode = (node) => {
        const newId = idGeneratorFn();
        idMap.set(node.id, newId);

        // Create shallow copy, removing system fields
        const { id, created_at, updated_at, ...rest } = node;

        return {
            ...rest,
            id: newId,
            original_id: node.id, // Keep track of source for reference if needed
            children: [], // Will be populated
        };
    };

    // 3. Recursive function to build the tree
    const buildTree = async (currentNode) => {
        const clonedNode = cloneNode(currentNode);

        // Fetch children for the original node
        const children = await fetchChildrenFn(currentNode.id);

        if (Array.isArray(children) && children.length > 0) {
            // Recursively clone children
            const clonedChildren = await Promise.all(
                children.map(child => buildTree(child))
            );

            // Sort children by position if available, or creation time? 
            // Assuming fetchChildrenFn returns them in correct order or we sort here.
            // Let's assume they come back in order or we don't strictly enforce sorting here yet.

            clonedNode.children = clonedChildren;

            // Update parent_id for children (if we were returning a flat list, but here we return a tree)
            // If the consumer needs a flat list for insertion, they can flatten this tree.
            // But usually for insertion we might need to set parent_id explicitly.
            // Let's ensure children have the new parent_id set.
            clonedChildren.forEach(child => {
                child.parent_id = clonedNode.id;
            });
        }

        return clonedNode;
    };

    return buildTree(rootTask);
};

/**
 * Flattens a task tree into an array of task objects ready for insertion.
 * 
 * @param {Object} rootNode - The root node of the tree (already cloned/transformed).
 * @returns {Array<Object>} - Flat array of tasks.
 */
export const flattenTaskTree = (rootNode) => {
    if (!rootNode) return [];

    const result = [];

    const traverse = (node) => {
        // Destructure to separate children from the task record
        const { children, ...taskData } = node;
        result.push(taskData);

        if (children && children.length > 0) {
            children.forEach(traverse);
        }
    };

    traverse(rootNode);
    return result;
};
