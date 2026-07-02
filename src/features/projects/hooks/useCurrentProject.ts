import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEY = 'planterplan.currentProjectId';

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
 */
export function useCurrentProject(projects: CurrentProjectOption[]): UseCurrentProjectResult {
    const [stored, setStored] = useState<string | null>(readStored);

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
    }, []);

    return { currentProjectId, setCurrentProjectId };
}
