import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractMentions, resolveMentions } from '@/features/tasks/lib/comment-mentions';

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        rpc: rpcMock,
    },
}));

describe('extractMentions (Wave 26)', () => {
    it('returns an empty array for an empty body', () => {
        expect(extractMentions('')).toEqual([]);
    });

    it('returns an empty array when there are no @-mentions', () => {
        expect(extractMentions('Hello world, no mentions here.')).toEqual([]);
    });

    it('extracts a single mention', () => {
        expect(extractMentions('Hey @alice take a look')).toEqual(['alice']);
    });

    it('extracts multiple mentions in first-occurrence order', () => {
        expect(extractMentions('@alice and @bob and @carol')).toEqual(['alice', 'bob', 'carol']);
    });

    it('deduplicates repeated mentions, keeping first occurrence', () => {
        expect(extractMentions('@alice @bob @alice @bob @alice')).toEqual(['alice', 'bob']);
    });

    it('trims trailing punctuation (`.`, `-`, `_`) from handles', () => {
        expect(extractMentions('hi @joe.')).toEqual(['joe']);
        expect(extractMentions('hi @joe_')).toEqual(['joe']);
        expect(extractMentions('hi @joe-')).toEqual(['joe']);
        expect(extractMentions('hi @joe..._-')).toEqual(['joe']);
    });

    it('preserves internal `.`, `-`, `_` in handles', () => {
        expect(extractMentions('@joe.smith and @mary-jane and @bob_y')).toEqual([
            'joe.smith',
            'mary-jane',
            'bob_y',
        ]);
    });

    it('lowercases all extracted handles', () => {
        expect(extractMentions('@Alice @BOB @CarolMarie')).toEqual(['alice', 'bob', 'carolmarie']);
    });

    it('handles adjacent `@@name` (captures the second one)', () => {
        expect(extractMentions('@@joe hello')).toEqual(['joe']);
    });

    it('returns an empty array when `@` is followed only by punctuation', () => {
        expect(extractMentions('email me @ hello @. @-')).toEqual([]);
    });

    it('works across multi-line bodies', () => {
        const body = ['First line mentions @alice.', '', 'Second paragraph mentions @bob and also @alice again.'].join('\n');
        expect(extractMentions(body)).toEqual(['alice', 'bob']);
    });
});

describe('resolveMentions (Wave 30)', () => {
    beforeEach(() => {
        rpcMock.mockReset();
    });

    it('returns an empty array without hitting the RPC when handles are empty', async () => {
        const result = await resolveMentions([]);
        expect(result).toEqual([]);
        expect(rpcMock).not.toHaveBeenCalled();
    });

    it('maps each matched handle to its user_id, dropping unmatched handles', async () => {
        rpcMock.mockResolvedValueOnce({
            data: [
                { handle: 'alice', user_id: '00000000-0000-0000-0000-000000000001' },
                { handle: 'ghost', user_id: null },
                { handle: 'bob', user_id: '00000000-0000-0000-0000-000000000002' },
            ],
            error: null,
        });

        const result = await resolveMentions(['alice', 'ghost', 'bob']);
        expect(result).toEqual([
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
        ]);
        expect(rpcMock).toHaveBeenCalledWith('resolve_user_handles', { p_handles: ['alice', 'ghost', 'bob'] });
    });

    it('returns no mentions and warns when the RPC errors', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        rpcMock.mockResolvedValueOnce({
            data: null,
            error: new Error('RPC failed'),
        });

        const result = await resolveMentions(['alice', 'bob']);
        expect(result).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
            '[comments] mention resolution failed; posting comment without mention notifications',
            { handles: ['alice', 'bob'], error: 'RPC failed' },
        );
        warnSpy.mockRestore();
    });

    it('returns no mentions and warns when the RPC returns null data without error', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        rpcMock.mockResolvedValueOnce({ data: null, error: null });

        const result = await resolveMentions(['alice']);
        expect(result).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
            '[comments] mention resolution failed; posting comment without mention notifications',
            { handles: ['alice'], error: 'empty resolve_user_handles response' },
        );
        warnSpy.mockRestore();
    });

    it('passes through handles when ALL lookups miss', async () => {
        rpcMock.mockResolvedValueOnce({
            data: [
                { handle: 'ghost-a', user_id: null },
                { handle: 'ghost-b', user_id: null },
            ],
            error: null,
        });

        const result = await resolveMentions(['ghost-a', 'ghost-b']);
        // With an all-null response, the filter produces an empty array.
        // The trigger's uuid-regex guard drops any non-uuid values silently.
        expect(result).toEqual([]);
    });
});
