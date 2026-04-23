import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { planter } from '@/shared/api/planterClient';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import type { IcsFeedTokenRow } from '@/shared/db/app.types';
import { Copy, Trash2, Plus, RotateCw } from 'lucide-react';
import { useConfirm } from '@/shared/ui/confirm-dialog';

/**
 * Wave 35 Task 1 — Settings → Integrations → Calendar feeds.
 *
 * Lists the caller's ICS tokens (active + revoked), exposes "Generate new
 * feed" + per-row Copy-URL + Revoke controls. Revocation is soft so the row
 * stays visible for audit; a revoked row's URL is disabled.
 *
 * The feed URL includes the Supabase project URL + the ICS edge function path
 * + the opaque token. The token is the credential; no additional auth is
 * required at fetch time.
 */
export default function IcsFeedsCard() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const tokens = useQuery<IcsFeedTokenRow[]>({
        queryKey: ['icsFeedTokens'],
        queryFn: () => planter.integrations.listIcsFeedTokens(),
    });

    const [label, setLabel] = useState('');
    const [rotatingId, setRotatingId] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: (input: { label: string | null }) =>
            planter.integrations.createIcsFeedToken({ label: input.label, project_filter: null }),
        onSuccess: () => {
            toast.success(t('ics.created_toast'));
            setLabel('');
            void queryClient.invalidateQueries({ queryKey: ['icsFeedTokens'] });
        },
        onError: (err: unknown) => toast.error((err as Error).message || t('ics.failed_create_toast')),
    });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => planter.integrations.revokeIcsFeedToken(id),
        onSuccess: () => {
            toast.success(t('ics.revoked_toast'));
            void queryClient.invalidateQueries({ queryKey: ['icsFeedTokens'] });
        },
        onError: (err: unknown) => toast.error((err as Error).message || t('ics.failed_revoke_toast')),
    });

    /**
     * Atomic rotate: revoke the old token, create a new one with the same
     * label, copy the new URL to the clipboard. The UX audit flagged the
     * manual revoke → create → re-label → copy dance as error-prone when
     * a user fears token exposure. This collapses it into one click.
     */
    const supabaseUrl = useMemo(() => import.meta.env.VITE_SUPABASE_URL ?? '', []);
    const feedUrlFor = (token: string) =>
        supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ics-feed?token=${encodeURIComponent(token)}` : '';

    const handleRotate = async (feed: IcsFeedTokenRow) => {
        const ok = await confirm({
            title: t('ics.rotate_confirm_title'),
            description: t('ics.rotate_confirm_description'),
            confirmText: t('ics.rotate_confirm_button'),
        });
        if (!ok) return;
        setRotatingId(feed.id);
        try {
            // Order matters: revoke old first, then create new. If creation
            // fails, the user is left with one revoked feed rather than two
            // active ones (safer default).
            await planter.integrations.revokeIcsFeedToken(feed.id);
            const created = await planter.integrations.createIcsFeedToken({
                label: feed.label ?? null,
                project_filter: feed.project_filter ?? null,
            });
            await queryClient.invalidateQueries({ queryKey: ['icsFeedTokens'] });
            const url = feedUrlFor(created.token);
            if (url) {
                try {
                    await navigator.clipboard.writeText(url);
                    toast.success(t('ics.rotated_copied_toast'));
                } catch {
                    toast.success(t('ics.rotated_in_list_toast'));
                }
            } else {
                toast.success(t('ics.rotated_in_list_toast'));
            }
        } catch (err) {
            toast.error(t('ics.failed_rotate_toast'), { description: (err as Error)?.message });
        } finally {
            setRotatingId(null);
        }
    };

    const handleCopy = async (token: string) => {
        const url = feedUrlFor(token);
        if (!url) {
            toast.error(t('ics.missing_supabase_url'));
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('ics.copied_toast'));
        } catch {
            toast.error(t('ics.failed_copy_toast'));
        }
    };

    return (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm" data-testid="ics-feeds-card">
            <header className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">{t('ics.card_title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('ics.card_description')}</p>
            </header>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    createMutation.mutate({ label: label.trim() || null });
                }}
                className="mb-6 flex items-end gap-3"
                data-testid="ics-feeds-create-form"
            >
                <div className="flex-1">
                    <label className="block text-xs font-medium text-muted-foreground" htmlFor="ics-feed-label">
                        {t('ics.label_input_label')}
                    </label>
                    <Input
                        id="ics-feed-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder={t('ics.label_input_placeholder')}
                        className="mt-1"
                        data-testid="ics-feeds-label-input"
                    />
                </div>
                <Button type="submit" disabled={createMutation.isPending} data-testid="ics-feeds-create-btn">
                    <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                    {createMutation.isPending ? t('ics.creating_button') : t('ics.generate_button')}
                </Button>
            </form>

            {tokens.isLoading ? (
                <p className="text-sm text-muted-foreground">{t('ics.loading')}</p>
            ) : tokens.error instanceof Error ? (
                <p className="text-sm text-red-600">{tokens.error.message}</p>
            ) : (tokens.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('ics.empty_state')}</p>
            ) : (
                <ul className="divide-y divide-border" data-testid="ics-feeds-list">
                    {(tokens.data ?? []).map((feed) => {
                        const isRevoked = feed.revoked_at !== null;
                        return (
                            <li key={feed.id} className="flex items-center justify-between gap-4 py-3" data-testid={`ics-feed-row-${feed.id}`}>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900">
                                        {feed.label ?? <span className="text-muted-foreground">{t('ics.unlabeled')}</span>}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {t('ics.created_prefix', { date: formatDisplayDate(feed.created_at) })}
                                        {feed.last_accessed_at ? ` · ${t('ics.last_accessed_prefix', { date: formatDisplayDate(feed.last_accessed_at) })}` : ''}
                                        {isRevoked ? ` · ${t('ics.revoked_badge')}` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-shrink-0 gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handleCopy(feed.token)}
                                        disabled={isRevoked}
                                        data-testid={`ics-feed-copy-${feed.id}`}
                                    >
                                        <Copy aria-hidden="true" className="mr-1 h-3 w-3" />
                                        {t('ics.copy_url_button')}
                                    </Button>
                                    {!isRevoked && (
                                        <>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleRotate(feed)}
                                                disabled={rotatingId === feed.id}
                                                data-testid={`ics-feed-rotate-${feed.id}`}
                                                aria-label={t('ics.rotate_aria', { label: feed.label ?? t('ics.unlabeled_short') })}
                                            >
                                                <RotateCw aria-hidden="true" className={`mr-1 h-3 w-3 ${rotatingId === feed.id ? 'animate-spin' : ''}`} />
                                                {t('ics.rotate_button')}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => revokeMutation.mutate(feed.id)}
                                                disabled={revokeMutation.isPending}
                                                data-testid={`ics-feed-revoke-${feed.id}`}
                                            >
                                                <Trash2 aria-hidden="true" className="mr-1 h-3 w-3" />
                                                {t('ics.revoke_button')}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
