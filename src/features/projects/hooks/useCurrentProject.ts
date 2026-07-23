import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'planterplan.currentProjectId';
// Same-tab broadcast so every mounted useCurrentProject instance (header
// switcher, Home dashboard, Tasks scope) reflects a focus change immediately —
// the `storage` event only fires across tabs, not within the tab that wrote it.
const CHANGE_EVENT = 'planterplan:current-project-changed';

export interface CurrentProjectOption {
    id: string;
    title?: string;
}

export interface UseCurrentProjectResult {
    /** The resolved active project id: the persisted choice if still available, else the first project, else null. */
    currentProjectId: string | null;
    /** Persist a new active project (writes `localStorage.planterplan.currentProjectId`). */
    setCurrentProjectId: (id: string) => void;
}

function readStored(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Private-mode / disabled storage — fall back to in-memory only.
        return null;
    }
}

/**
 * Resolve the "current project" for the project-centric Home surface.
 *
 * The app has no server-side notion of an active project — selection is
 * otherwise URL-driven (`/project/:id`). This hook mirrors the LocaleSwitcher
 * pattern: a `localStorage`-backed choice that gracefully falls back to the
 * first available project when the stored id is stale (archived, deleted, or
 * belongs to a different account) or unset.
 *
 * @param projects The projects the user may switch between (instances + joined).
 * @param opts.persistDefault When true, the resolved fallback (first project) is
 *   written to storage on mount if nothing is stored yet — so every other
 *   `useCurrentProject` instance (which may order its own list differently)
 *   converges on the SAME current project instead of each picking its own
 *   first entry. Pass this from exactly one authoritative caller (the header
 *   switcher) to avoid races.
 */
export function useCurrentProject(
    projects: CurrentProjectOption[],
    opts?: { persistDefault?: boolean },
): UseCurrentProjectResult {
    const persistDefault = opts?.persistDefault ?? false;
    const [stored, setStored] = useState<string | null>(readStored);

    // Keep this instance in sync when the focus project is changed elsewhere —
    // another tab (`storage`) or another component in this tab (CHANGE_EVENT).
    useEffect(() => {
        const syncFromStorage = () => setStored(readStored());
        const syncFromEvent = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail;
            setStored(typeof detail === 'string' ? detail : readStored());
        };
        window.addEventListener('storage', syncFromStorage);
        window.addEventListener(CHANGE_EVENT, syncFromEvent as EventListener);
        return () => {
            window.removeEventListener('storage', syncFromStorage);
            window.removeEventListener(CHANGE_EVENT, syncFromEvent as EventListener);
        };
    }, []);

    const currentProjectId = useMemo(() => {
        if (projects.length === 0) return null;
        if (stored && projects.some((p) => p.id === stored)) return stored;
        return projects[0].id;
    }, [projects, stored]);

    const setCurrentProjectId = useCallback((id: string) => {
        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch {
            // Ignore write failures (private mode); state still updates below.
        }
        setStored(id);
        try {
            window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
        } catch {
            // CustomEvent unsupported — same-tab listeners just won't live-sync.
        }
    }, []);

    // Authoritative default: claim the resolved fallback into storage (once) so
    // other instances that order their project list differently don't each pick
    // a different "first project" — which would desync the header label from the
    // page it scopes. Only the caller that passes persistDefault does this. We
    // write storage + broadcast rather than calling setStored directly: this
    // instance already resolves to `currentProjectId`, and other instances pick
    // it up via their CHANGE_EVENT listener.
    useEffect(() => {
        if (!persistDefault || readStored() || !currentProjectId) return;
        try {
            localStorage.setItem(STORAGE_KEY, currentProjectId);
            window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: currentProjectId }));
        } catch {
            // Storage/CustomEvent unavailable — instances just keep their own default.
        }
    }, [persistDefault, currentProjectId]);

    return { currentProjectId, setCurrentProjectId };
}
