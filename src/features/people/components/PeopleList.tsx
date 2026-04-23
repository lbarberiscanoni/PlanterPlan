import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Plus, Search, Mail, Phone, MoreHorizontal, Loader2 } from 'lucide-react';
import AddPersonModal from './AddPersonModal';
import { toast } from 'sonner';
import { planter } from '@/shared/api/planterClient';
import { compareDateDesc } from '@/shared/lib/date-engine';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { safeUrl } from '@/shared/lib/safe-url';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import type { PersonRow, PersonInsert } from '@/shared/db/app.types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

const STATUS_OPTS: Record<string, string> = {
    'New': 'bg-brand-100 text-brand-700',
    'Contacted': 'bg-indigo-100 text-indigo-700',
    'Meeting Scheduled': 'bg-purple-100 text-purple-700',
    'Joined': 'bg-emerald-100 text-emerald-700',
    'Not Interested': 'bg-slate-100 text-slate-500',
    'default': 'bg-slate-100 text-slate-700'
};

export interface Person {
    id: string;
    first_name: string;
    last_name: string | null;
    role: string | null;
    status: string | null;
    email: string | null;
    phone: string | null;
    project_id?: string | null;
}

interface PeopleListProps {
    projectId: string;
    canEdit?: boolean;
}

export default function PeopleList({ projectId, canEdit = false }: PeopleListProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const confirm = useConfirm();

    const [search, setSearch] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingPerson, setEditingPerson] = useState<Person | null>(null);

    // React Query-backed fetch. The prior hand-rolled useState+useEffect+load
    // pattern bypassed the app's canonical cache + invalidate-on-mutation +
    // window-focus-revalidate behavior; mutations had to manually re-fetch.
    const {
        data: people = [],
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery<Person[]>({
        queryKey: ['people', projectId],
        queryFn: async () => {
            const data = await planter.entities.Person.filter({ project_id: projectId });
            return ((data || []) as PersonRow[])
                .slice()
                .sort((a, b) => compareDateDesc(a.created_at, b.created_at)) as Person[];
        },
        enabled: !!projectId,
        staleTime: STALE_TIMES.medium,
    });

    const saveMutation = useMutation({
        mutationFn: async ({ personData, editingId }: { personData: Partial<Person>; editingId: string | null }) => {
            if (editingId) {
                return await planter.entities.Person.update(editingId, personData);
            }
            return await planter.entities.Person.create({ ...personData, project_id: projectId } as PersonInsert);
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['people', projectId] });
            toast.success(vars.editingId ? t('projects.people.updated_toast') : t('projects.people.added_toast'));
        },
        onError: (err: Error) => {
            toast.error(t('projects.people.failed_save_toast'), { description: err.message });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => planter.entities.Person.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['people', projectId] });
            toast.success(t('projects.people.deleted_toast'));
        },
        onError: (err: Error) => {
            toast.error(t('projects.people.failed_delete_toast'), { description: err.message });
        },
    });

    const handleSave = async (personData: Partial<Person>) => {
        // Re-throwing here (via mutateAsync) keeps AddPersonModal's form open
        // on failure so the user can retry without losing their input.
        await saveMutation.mutateAsync({ personData, editingId: editingPerson?.id ?? null });
        setEditingPerson(null);
        setIsAddModalOpen(false);
    };

    const handleDelete = async (person: Person) => {
        const label = [person.first_name, person.last_name].filter(Boolean).join(' ') || t('common.unknown_name');
        const ok = await confirm({
            title: t('projects.people.remove_confirm_title', { name: label }),
            description: t('projects.people.remove_confirm_description'),
            confirmText: t('common.delete'),
            destructive: true,
        });
        if (!ok) return;
        deleteMutation.mutate(person.id);
    };

    const filteredPeople = useMemo(() => {
        const q = search.toLowerCase();
        return people.filter(p =>
            ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase().includes(q) ||
            (p.email?.toLowerCase().includes(q))
        );
    }, [people, search]);

    if (isLoading) return (
        <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
    );

    if (isError) return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
            <p className="text-destructive font-medium">{t('projects.people.failed_to_load')}</p>
            <p className="text-muted-foreground text-sm max-w-md">
                {(error as Error)?.message ?? t('errors.unknown')}
            </p>
            <Button variant="outline" onClick={() => refetch()}>{t('common.retry')}</Button>
        </div>
    );

    const nameOf = (p: Person) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim();

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                    <Input
                        placeholder={t('projects.people.search_placeholder')}
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label={t('projects.people.search_placeholder')}
                    />
                </div>
                {canEdit && (
                    <Button onClick={() => { setEditingPerson(null); setIsAddModalOpen(true); }}>
                        <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                        {t('projects.people.add_person_button')}
                    </Button>
                )}
            </div>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                            <tr>
                                <th scope="col" className="px-4 py-3">{t('projects.people.col_name')}</th>
                                <th scope="col" className="px-4 py-3">{t('projects.people.col_role')}</th>
                                <th scope="col" className="px-4 py-3">{t('projects.people.col_status')}</th>
                                <th scope="col" className="px-4 py-3">{t('projects.people.col_contact')}</th>
                                <th scope="col" className="px-4 py-3 text-right">{t('projects.people.col_actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredPeople.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                        {people.length === 0
                                            ? t('projects.people.empty_title_no_results')
                                            : t('projects.people.empty_title_no_match')}
                                    </td>
                                </tr>
                            ) : (
                                filteredPeople.map(person => {
                                    const displayName = nameOf(person);
                                    return (
                                    <tr key={person.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-4 py-3 font-medium text-slate-900">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                                    {person.first_name?.[0]}{person.last_name ? person.last_name[0] : ''}
                                                </div>
                                                {displayName}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {person.role ? t(`projects.people.roles.${person.role}` as never, { defaultValue: person.role }) : ''}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge className={`hover:bg-opacity-80 border-0 ${STATUS_OPTS[person.status || 'default'] || STATUS_OPTS.default}`}>
                                                {person.status ? t(`projects.people.statuses.${person.status}` as never, { defaultValue: person.status }) : ''}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3 text-slate-400">
                                                {person.email && (
                                                    <a
                                                        href={safeUrl(`mailto:${person.email}`)}
                                                        className="hover:text-slate-600"
                                                        aria-label={t('projects.people.email_aria', { name: displayName })}
                                                    >
                                                        <Mail className="w-4 h-4" aria-hidden="true" />
                                                    </a>
                                                )}
                                                {person.phone && (
                                                    <a
                                                        href={safeUrl(`tel:${person.phone}`)}
                                                        className="hover:text-slate-600"
                                                        aria-label={t('projects.people.call_aria', { name: displayName })}
                                                    >
                                                        <Phone className="w-4 h-4" aria-hidden="true" />
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={t('projects.people.open_actions_menu')}>
                                                        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => { setEditingPerson(person); setIsAddModalOpen(true); }}>
                                                        {t('projects.people.edit_details')}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={() => handleDelete(person)}>
                                                        {t('projects.people.delete')}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {(isAddModalOpen || editingPerson) && (
                <AddPersonModal
                    open={isAddModalOpen || !!editingPerson}
                    onClose={() => { setIsAddModalOpen(false); setEditingPerson(null); }}
                    onSave={handleSave}
                    initialData={editingPerson}
                />
            )}
        </div>
    );
}
