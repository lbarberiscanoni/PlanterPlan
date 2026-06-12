import type { Task } from '@/shared/db/app.types';

type StrategyCompletionListener = (task: Task) => void;

const listeners = new Set<StrategyCompletionListener>();

/**
 * Subscribe to "a strategy-template instance task just transitioned into
 * `completed`" events emitted by `planterClient.updateStatus`. Returns an
 * unsubscribe function.
 *
 * The single app-level `StrategyCompletionListener` renders the celebratory
 * follow-up dialog in response. Keeping the bus in `shared/` lets the data
 * layer (also `shared/`) emit without importing `features/` — the universal
 * status chokepoint is `updateStatus`, so emitting there covers every surface
 * (the /tasks pill, the project board, drag-and-drop) with one detection point.
 */
export function onStrategyTaskCompleted(listener: StrategyCompletionListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function emitStrategyTaskCompleted(task: Task): void {
    for (const listener of listeners) {
        try {
            listener(task);
        } catch (err) {
            console.error('[strategy-completion-bus] listener threw:', err);
        }
    }
}
