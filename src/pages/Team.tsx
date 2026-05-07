import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Trash2, UserPlus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { planter } from '@/shared/api/planterClient';
import { useAuth } from '@/shared/contexts/auth-context';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import { formatDateLocalized } from '@/shared/i18n/formatters';
import { ROLES } from '@/shared/constants';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { useConfirm } from '@/shared/ui/confirm-dialog-context';
import InviteMemberModal from '@/features/projects/components/InviteMemberModal';
import { useTeam } from '@/features/people/hooks/useTeam';
import { canManageProjectMembers } from '@/features/projects/lib/project-member-permissions';
import type { Project, TeamMemberWithProfile } from '@/shared/db/app.types';

function memberName(member: TeamMemberWithProfile, fallback: string) {
    const joinedName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
    return member.display_name || joinedName || member.email || fallback;
}

function memberInitials(name: string) {
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('');
    return initials || '?';
}

export default function Team() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedProjectId = searchParams.get('project');
    const [showInviteModal, setShowInviteModal] = useState(false);

    const {
        data: projects = [],
        isLoading: loadingProjects,
        error: projectsError,
    } = useQuery<Project[]>({
        queryKey: ['teamPageProjects', user?.id],
        queryFn: () => planter.entities.Project.list(),
        enabled: !!user,
        staleTime: STALE_TIMES.medium,
    });

    const {
        project,
        teamMembers,
        isLoading: loadingTeam,
        error: teamError,
        mutations,
    } = useTeam(selectedProjectId);

    const selectedProject = useMemo(
        () => project ?? projects.find(candidate => candidate.id === selectedProjectId),
        [project, projects, selectedProjectId],
    );

    const currentMember = teamMembers.find(member => member.user_id === user?.id);
    const effectiveRole = user?.role === ROLES.ADMIN ? ROLES.ADMIN : currentMember?.role;
    const canManageMembers = canManageProjectMembers(effectiveRole);
    const isLoading = loadingProjects || (Boolean(selectedProjectId) && loadingTeam);
    const error = projectsError ?? teamError;

    const handleProjectChange = (projectId: string) => {
        if (projectId) {
            setSearchParams({ project: projectId });
        } else {
            setSearchParams({});
        }
    };

    const handleRemoveMember = async (member: TeamMemberWithProfile) => {
        const name = memberName(member, t('projects.team_page.unknown_member'));
        const ok = await confirm({
            title: t('projects.team_page.remove_confirm_title', { name }),
            description: t('projects.team_page.remove_confirm_description'),
            confirmText: t('common.remove'),
            destructive: true,
        });
        if (!ok) return;
        mutations.deleteMember.mutate(member.id);
    };

    return (
        <div className="min-h-full bg-background">
            <div className="border-b bg-card">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                                    <Users className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        {selectedProject?.title
                                            ? t('projects.team_page.title_with_project', { project: selectedProject.title })
                                            : t('projects.team_page.title')}
                                    </h1>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {t('projects.team_page.subtitle')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {selectedProject && canManageMembers && (
                            <Button onClick={() => setShowInviteModal(true)}>
                                <UserPlus className="h-4 w-4" aria-hidden="true" />
                                {t('projects.team_page.add_member')}
                            </Button>
                        )}
                    </div>

                    <div className="max-w-md space-y-2">
                        <Label htmlFor="team-project-select">{t('projects.team_page.project_label')}</Label>
                        <select
                            id="team-project-select"
                            value={selectedProjectId ?? ''}
                            onChange={event => handleProjectChange(event.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option value="">{t('projects.team_page.project_placeholder')}</option>
                            {projects.map(candidate => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.title || t('projects.team_page.untitled_project')}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {isLoading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 data-testid="loading-spinner" className="h-8 w-8 animate-spin text-brand-600" />
                    </div>
                )}

                {!isLoading && error && (
                    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                        {error.message}
                    </div>
                )}

                {!isLoading && !error && !selectedProjectId && (
                    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                        <Users className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
                        <h2 className="mt-4 text-lg font-semibold text-foreground">{t('projects.team_page.select_heading')}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">{t('projects.team_page.select_description')}</p>
                    </div>
                )}

                {!isLoading && !error && selectedProjectId && teamMembers.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                        <Users className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
                        <h2 className="mt-4 text-lg font-semibold text-foreground">{t('projects.team_page.empty_heading')}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">{t('projects.team_page.empty_description')}</p>
                        {canManageMembers && (
                            <Button className="mt-5" onClick={() => setShowInviteModal(true)}>
                                <UserPlus className="h-4 w-4" aria-hidden="true" />
                                {t('projects.team_page.add_first_member')}
                            </Button>
                        )}
                    </div>
                )}

                {!isLoading && !error && teamMembers.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {teamMembers.map(member => {
                            const name = memberName(member, t('projects.team_page.unknown_member'));
                            const email = member.email ?? t('projects.team_page.email_unavailable');
                            const canRemoveMember = canManageMembers && member.user_id !== user?.id;

                            return (
                                <article
                                    key={member.id}
                                    data-testid="team-member-card"
                                    className="rounded-lg border bg-card p-4 shadow-sm"
                                >
                                    <div className="flex items-start gap-3">
                                        <Avatar className="h-11 w-11">
                                            {member.avatar_url && <AvatarImage src={member.avatar_url} alt={name} />}
                                            <AvatarFallback>{memberInitials(name)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h2 className="truncate text-base font-semibold text-foreground">{name}</h2>
                                                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                                                        <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                                                        <span className="truncate">{email}</span>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="shrink-0 capitalize">
                                                    {t(`projects.team_page.roles.${member.role}` as const, { defaultValue: member.role })}
                                                </Badge>
                                            </div>

                                            <div className="mt-4 flex items-center justify-between gap-3">
                                                <span className="text-xs text-muted-foreground">
                                                    {member.joined_at
                                                        ? t('projects.team_page.joined_known', {
                                                            date: formatDateLocalized(member.joined_at, 'short'),
                                                        })
                                                        : t('projects.team_page.joined_unknown')}
                                                </span>
                                                {canRemoveMember && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => void handleRemoveMember(member)}
                                                        aria-label={t('projects.team_page.remove_member_aria', { name })}
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                        {t('common.remove')}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </main>

            {showInviteModal && selectedProject && (
                <InviteMemberModal
                    project={{ id: selectedProject.id, title: selectedProject.title }}
                    onClose={() => setShowInviteModal(false)}
                    onInviteSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['teamMembers', selectedProject.id] });
                    }}
                />
            )}
        </div>
    );
}
