import { describe, it, expect, vi } from 'vitest';
import { onStrategyTaskCompleted, emitStrategyTaskCompleted } from '@/shared/lib/strategy-completion-bus';
import type { Task } from '@/shared/db/app.types';

const fakeTask = (id: string) => ({ id, title: id } as unknown as Task);

describe('strategy-completion-bus', () => {
    it('notifies every active subscriber with the emitted task', () => {
        const a = vi.fn();
        const b = vi.fn();
        const offA = onStrategyTaskCompleted(a);
        const offB = onStrategyTaskCompleted(b);

        const task = fakeTask('t-1');
        emitStrategyTaskCompleted(task);

        expect(a).toHaveBeenCalledWith(task);
        expect(b).toHaveBeenCalledWith(task);
        offA();
        offB();
    });

    it('stops notifying after unsubscribe', () => {
        const listener = vi.fn();
        const off = onStrategyTaskCompleted(listener);
        off();

        emitStrategyTaskCompleted(fakeTask('t-2'));
        expect(listener).not.toHaveBeenCalled();
    });

    it('isolates a throwing listener so others still run', () => {
        const boom = vi.fn(() => { throw new Error('listener blew up'); });
        const ok = vi.fn();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const offBoom = onStrategyTaskCompleted(boom);
        const offOk = onStrategyTaskCompleted(ok);

        expect(() => emitStrategyTaskCompleted(fakeTask('t-3'))).not.toThrow();
        expect(ok).toHaveBeenCalledTimes(1);

        consoleError.mockRestore();
        offBoom();
        offOk();
    });
});
