import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase stub.
function makeChain(resolved: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        order: vi.fn(() => chain),
        then: (resolve: (v: typeof resolved) => unknown) => resolve(resolved),
    };
    return chain;
}

const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock('@/shared/db/client', () => ({
    supabase: {
        from: (...args: unknown[]) => fromMock(...args),
        rpc: (...args: unknown[]) => rpcMock(...args),
        auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
    },
}));

import { planter } from '@/shared/api/planterClient';

describe('Task.clone template_version stamp (Wave 36 Task 1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stamps settings.cloned_from_template_version = source.template_version on the cloned root', async () => {
        // RPC returns the clone pointer.
        rpcMock.mockResolvedValue({ data: { new_root_id: 'clone-root', root_project_id: 'rp', tasks_cloned: 3 }, error: null });

        let call = 0;
        fromMock.mockImplementation(() => {
            call += 1;
            switch (call) {
                case 1:
                    // Task.get(cloned root) — returns the hydrated clone row with
                    // default template_version=1 (value doesn't matter here; the
                    // stamp is driven by the source template's value).
                    return makeChain({
                        data: {
                            id: 'clone-root',
                            title: 'Cloned',
                            origin: 'instance',
                            settings: {},
                            template_version: 1,
                        },
                        error: null,
                    });
                case 2:
                    // Task.get(source template) — this is the lookup the stamp uses.
                    return makeChain({
                        data: {
                            id: 'tpl-1',
                            title: 'Source template',
                            origin: 'template',
                            settings: {},
                            template_version: 7,
                        },
                        error: null,
                    });
                case 3:
                    // Task.update(cloned root, { settings }) with the stamp.
                    return makeChain({
                        data: {
                            id: 'clone-root',
                            title: 'Cloned',
                            origin: 'instance',
                            settings: {
                                spawnedFromTemplate: 'tpl-1',
                                cloned_from_template_version: 7,
                            },
                            template_version: 1,
                        },
                        error: null,
                    });
                default:
                    return makeChain({ data: null, error: null });
            }
        });

        const result = await planter.entities.Task.clone('tpl-1', null, 'instance', 'u1');
        expect(result.error).toBeNull();
        expect(result.data?.settings).toMatchObject({
            spawnedFromTemplate: 'tpl-1',
            cloned_from_template_version: 7,
        });

        // RPC invoked exactly once with the template id.
        expect(rpcMock).toHaveBeenCalledWith('clone_project_template', expect.objectContaining({ p_template_id: 'tpl-1' }));
    });

    it('gracefully skips the template_version stamp when the source template lookup fails', async () => {
        rpcMock.mockResolvedValue({ data: { new_root_id: 'clone-root', root_project_id: 'rp', tasks_cloned: 3 }, error: null });

        let call = 0;
        fromMock.mockImplementation(() => {
            call += 1;
            if (call === 1) {
                return makeChain({
                    data: { id: 'clone-root', title: 'Cloned', origin: 'instance', settings: {}, template_version: 1 },
                    error: null,
                });
            }
            if (call === 2) {
                // Source template lookup — simulate transient error / missing row.
                return makeChain({ data: null, error: null });
            }
            if (call === 3) {
                // Update still runs, just without the version key.
                return makeChain({
                    data: {
                        id: 'clone-root',
                        title: 'Cloned',
                        origin: 'instance',
                        settings: { spawnedFromTemplate: 'tpl-1' },
                    },
                    error: null,
                });
            }
            return makeChain({ data: null, error: null });
        });

        const result = await planter.entities.Task.clone('tpl-1', null, 'instance', 'u1');
        expect(result.error).toBeNull();
        const settings = result.data?.settings as Record<string, unknown> | undefined;
        expect(settings?.spawnedFromTemplate).toBe('tpl-1');
        expect(settings).not.toHaveProperty('cloned_from_template_version');
    });
});
