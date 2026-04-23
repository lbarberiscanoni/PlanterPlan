import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import { useAuth } from '@/shared/contexts/AuthContext';
import { PROJECT_STATUS } from '@/shared/constants/domain';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import type { Database } from '@/shared/db/database.types';
import type { Task, Project } from '@/shared/db/app.types';

type TeamMemberRow = Database['public']['Tables']['project_members']['Row'];

export function useDashboard() {
 const { user, loading: authLoading } = useAuth();
 // URL Action State
 const [searchParams, setSearchParams] = useSearchParams();
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [showTemplateModal, setShowTemplateModal] = useState(false);

 // Dashboard Specific Local State
 const [wizardDismissed, setWizardDismissed] = useState<boolean>(() => {
 return localStorage.getItem('gettingStartedDismissed') === 'true';
 });
 const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');

 // Auto-open modal when navigated with ?action=new-project or ?action=new-template
 useEffect(() => {
 const action = searchParams.get('action');
 if (action === 'new-project') {
 // eslint-disable-next-line react-hooks/set-state-in-effect
 setShowCreateModal(true);
 searchParams.delete('action');
 setSearchParams(searchParams, { replace: true });
 } else if (action === 'new-template') {
 setShowTemplateModal(true);
 searchParams.delete('action');
 setSearchParams(searchParams, { replace: true });
 }
 }, [searchParams, setSearchParams]);

 // Data Fetching. `staleTime: STALE_TIMES.medium` across the board so
 // Dashboard ↔ Tasks ↔ Project toggles don't refetch 3 times per nav.
 const {
 data: projects = [],
 isLoading: loadingProjects,
 isError,
 error
 } = useQuery<Project[]>({
 queryKey: ['projects'],
 queryFn: () => planter.entities.Project.list(),
 enabled: !!user,
 staleTime: STALE_TIMES.medium,
 });

 const { data: allTasks = [] } = useQuery<Task[]>({
 queryKey: ['allTasks', user?.id],
 queryFn: () => planter.entities.Task.listByCreator(user?.id as string),
 enabled: !!user,
 staleTime: STALE_TIMES.medium,
 });

 // Scope by caller uid: the previous unfiltered `TeamMember.list()` pulled
 // every membership the user could see across every project — with N
 // projects and M average memberships, O(N*M) rows for a card that only
 // cares about the caller's own memberships.
 const { data: teamMembers = [] } = useQuery<TeamMemberRow[]>({
 queryKey: ['teamMembers', user?.id],
 queryFn: () => planter.entities.TeamMember.filter({ user_id: user?.id }),
 enabled: !!user,
 staleTime: STALE_TIMES.medium,
 });

 // Derived State / Filtering
 const activeProjects = useMemo(() => {
 if (!Array.isArray(projects)) return [];
 return projects.filter(p => p.status !== PROJECT_STATUS.ARCHIVED && !p.is_complete);
 }, [projects]);

 const archivedProjects = useMemo(() => {
 if (!Array.isArray(projects)) return [];
 return projects.filter(p => p.status === PROJECT_STATUS.ARCHIVED);
 }, [projects]);

 const filteredTasks = useMemo(() => {
 if (!Array.isArray(allTasks)) return [];

 let tasks = selectedProjectId
 ? allTasks.filter(t => t.project_id === selectedProjectId)
 : allTasks;

 if (searchQuery) {
 const lowerQuery = searchQuery.toLowerCase();
 tasks = tasks.filter(t =>
 t.title.toLowerCase().includes(lowerQuery) ||
 t.description?.toLowerCase().includes(lowerQuery)
 );
 }

 return tasks as Task[];
 }, [allTasks, selectedProjectId, searchQuery]);

 // Loading State Aggregation
 const isLoading = authLoading || loadingProjects;

 // Handlers
 const handleDismissWizard = () => {
 setWizardDismissed(true);
 localStorage.setItem('gettingStartedDismissed', 'true');
 };

 return {
 state: {
 isLoading,
 isError,
 error,
 user,
 showCreateModal,
 showTemplateModal,
 wizardDismissed,
 searchQuery,
 selectedProjectId
 },
 data: {
 projects,
 activeProjects,
 archivedProjects,
 allTasks,
 filteredTasks,
 teamMembers
 },
 actions: {
 setShowCreateModal,
 setShowTemplateModal,
 setSearchQuery,
 setSelectedProjectId,
 handleDismissWizard
 }
 };
}
