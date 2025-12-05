import { deepCloneTaskTree, flattenTaskTree } from './treeHelpers';

describe('treeHelpers', () => {
    describe('deepCloneTaskTree', () => {
        const mockIdGenerator = jest.fn();
        let idCounter = 0;

        beforeEach(() => {
            idCounter = 0;
            mockIdGenerator.mockImplementation(() => `new-id-${++idCounter}`);
        });

        it('clones a single root node correctly', async () => {
            const root = { id: 'root-1', title: 'Root', created_at: '2023-01-01' };
            const fetchChildren = jest.fn().mockResolvedValue([]);

            const result = await deepCloneTaskTree(root, fetchChildren, mockIdGenerator);

            expect(result).toEqual({
                id: 'new-id-1',
                title: 'Root',
                original_id: 'root-1',
                children: [],
            });
            expect(result.created_at).toBeUndefined(); // Should remove system fields
        });

        it('recursively clones children and updates parent_id', async () => {
            const root = { id: 'root-1', title: 'Root' };
            const child1 = { id: 'child-1', title: 'Child 1', parent_id: 'root-1' };
            const child2 = { id: 'child-2', title: 'Child 2', parent_id: 'root-1' };
            const grandChild = { id: 'grand-1', title: 'Grandchild', parent_id: 'child-1' };

            const fetchChildren = jest.fn((parentId) => {
                if (parentId === 'root-1') return Promise.resolve([child1, child2]);
                if (parentId === 'child-1') return Promise.resolve([grandChild]);
                return Promise.resolve([]);
            });

            const result = await deepCloneTaskTree(root, fetchChildren, mockIdGenerator);

            expect(result.id).toBe('new-id-1');
            expect(result.children).toHaveLength(2);

            const newChild1 = result.children[0];
            const newChild2 = result.children[1];

            expect(newChild1.id).toBe('new-id-2');
            expect(newChild1.parent_id).toBe('new-id-1');
            expect(newChild1.original_id).toBe('child-1');

            expect(newChild2.id).toBe('new-id-3');
            expect(newChild2.parent_id).toBe('new-id-1');

            expect(newChild1.children).toHaveLength(1);
            const newGrandChild = newChild1.children[0];

            expect(newGrandChild.id).toBe('new-id-4');
            expect(newGrandChild.parent_id).toBe('new-id-2');
            expect(newGrandChild.original_id).toBe('grand-1');
        });
    });

    describe('flattenTaskTree', () => {
        it('flattens a nested tree into an array', () => {
            const tree = {
                id: '1',
                title: 'Root',
                children: [
                    {
                        id: '2',
                        title: 'Child',
                        children: [
                            { id: '3', title: 'Grandchild', children: [] }
                        ]
                    }
                ]
            };

            const result = flattenTaskTree(tree);

            expect(result).toHaveLength(3);
            expect(result.map(t => t.id)).toEqual(['1', '2', '3']);
            expect(result[0].children).toBeUndefined();
            expect(result[1].children).toBeUndefined();
        });
    });
});
