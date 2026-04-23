import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Users, FolderKanban, FileStack } from 'lucide-react';
import { planter } from '@/shared/api/planterClient';
import type { AdminUserSearchRow } from '@/shared/db/app.types';

interface ProjectHit {
    kind: 'project' | 'template';
    id: string;
    title: string;
}

const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

/**
 * Wave 34 admin global search. Three parallel result types (Users, Projects,
 * Templates). Debounced at 200ms; fires only when the query is ≥2 chars.
 * Clicking a row navigates to the canonical detail surface.
 */
export default function AdminSearch() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [rawQuery, setRawQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setDebouncedQuery(rawQuery.trim()), DEBOUNCE_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [rawQuery]);

    const queryEnabled = debouncedQuery.length >= MIN_QUERY_LEN;

    const users = useQuery<AdminUserSearchRow[]>({
        queryKey: ['adminSearch', 'users', debouncedQuery],
        queryFn: () => planter.admin.searchUsers(debouncedQuery, 10),
        enabled: queryEnabled,
    });

    // Fetch the full task list ONCE (keyed without the debounced query) and
    // filter in-memory per keystroke. Re-fetching Task.list() on every
    // debounced tick was quadratic for large tenants.
    const allTasks = useQuery({
        queryKey: ['adminSearch', 'allTasks'],
        queryFn: () => planter.entities.Task.list(),
        staleTime: 60_000,
        enabled: queryEnabled,
    });

    const { projects, templates } = useMemo(() => {
        const out: { projects: ProjectHit[]; templates: ProjectHit[] } = { projects: [], templates: [] };
        if (!allTasks.data || !queryEnabled) return out;
        const q = debouncedQuery.toLowerCase();
        for (const t of allTasks.data) {
            if (t.parent_task_id !== null || typeof t.title !== 'string') continue;
            if (!t.title.toLowerCase().includes(q)) continue;
            const hit: ProjectHit = {
                kind: t.origin === 'template' ? 'template' : 'project',
                id: t.id,
                title: t.title,
            };
            if (hit.kind === 'project' && out.projects.length < 10) out.projects.push(hit);
            else if (hit.kind === 'template' && out.templates.length < 10) out.templates.push(hit);
            if (out.projects.length >= 10 && out.templates.length >= 10) break;
        }
        return out;
    }, [allTasks.data, debouncedQuery, queryEnabled]);

    const handleNavigateUser = (uid: string) => navigate(`/admin/users/${uid}`);
    const handleNavigateProject = (id: string) => navigate(`/Project/${id}`);
    const handleNavigateTemplate = (id: string) => navigate(`/Project/${id}`);

    return (
        <div className="w-full max-w-2xl" data-testid="admin-search">
            <label className="flex items-center gap-3 rounded-lg border border-input bg-card px-4 py-2 shadow-sm focus-within:border-brand-400">
                <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                <input
                    type="search"
                    value={rawQuery}
                    onChange={(e) => setRawQuery(e.target.value)}
                    placeholder={t('admin.search_placeholder')}
                    className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    aria-label={t('admin.search_aria_input')}
                    data-testid="admin-search-input"
                />
            </label>

            {queryEnabled && (
                <div
                    className="mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                    data-testid="admin-search-results"
                >
                    <ResultGroup
                        heading={t('admin.search_users_heading')}
                        icon={Users}
                        loading={users.isLoading}
                        error={users.error instanceof Error ? users.error.message : null}
                        items={(users.data ?? []).map((u) => ({
                            key: u.id,
                            primary: u.display_name,
                            secondary: `${u.email} · ${u.project_count} project${u.project_count === 1 ? '' : 's'}`,
                            onClick: () => handleNavigateUser(u.id),
                        }))}
                        testid="admin-search-users"
                    />
                    <ResultGroup
                        heading={t('admin.search_projects_heading')}
                        icon={FolderKanban}
                        loading={allTasks.isLoading}
                        error={allTasks.error instanceof Error ? allTasks.error.message : null}
                        items={projects.map((p) => ({
                            key: p.id,
                            primary: p.title || '(untitled)',
                            secondary: p.id,
                            onClick: () => handleNavigateProject(p.id),
                        }))}
                        testid="admin-search-projects"
                    />
                    <ResultGroup
                        heading={t('admin.search_templates_heading')}
                        icon={FileStack}
                        loading={allTasks.isLoading}
                        error={null}
                        items={templates.map((tmpl) => ({
                            key: tmpl.id,
                            primary: tmpl.title || '(untitled)',
                            secondary: tmpl.id,
                            onClick: () => handleNavigateTemplate(tmpl.id),
                        }))}
                        testid="admin-search-templates"
                    />
                </div>
            )}
        </div>
    );
}

interface ResultItem {
    key: string;
    primary: string;
    secondary?: string;
    onClick: () => void;
}

interface ResultGroupProps {
    heading: string;
    icon: React.ComponentType<{ className?: string }>;
    loading: boolean;
    error: string | null;
    items: ResultItem[];
    testid: string;
}

function ResultGroup({ heading, icon: Icon, loading, error, items, testid }: ResultGroupProps) {
    const { t } = useTranslation();
    if (!loading && !error && items.length === 0) return null;
    return (
        <section className="border-b border-border last:border-b-0" data-testid={testid}>
            <h3 className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon aria-hidden="true" className="h-3 w-3" />
                {heading}
            </h3>
            {loading ? (
                <p className="px-4 pb-3 text-sm text-muted-foreground">{t('admin.loading')}</p>
            ) : error ? (
                <p className="px-4 pb-3 text-sm text-red-600">{error}</p>
            ) : (
                <ul className="pb-1">
                    {items.map((item) => (
                        <li key={item.key}>
                            <button
                                type="button"
                                onClick={item.onClick}
                                className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-slate-50"
                            >
                                <span className="text-sm font-medium text-slate-900">{item.primary}</span>
                                {item.secondary && (
                                    <span className="text-xs text-muted-foreground">{item.secondary}</span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
