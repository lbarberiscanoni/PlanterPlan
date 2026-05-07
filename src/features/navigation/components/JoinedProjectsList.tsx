import SidebarNavItem from '@/shared/ui/SidebarNavItem';

interface JoinedProject {
 id: string;
 title?: string;
 membership_role?: string;
 [key: string]: unknown;
}

interface JoinedProjectsListProps {
 projects: JoinedProject[];
 error?: string | null;
 handleTaskClick: (project: JoinedProject) => void;
 selectedTaskId?: string | null;
}

const JoinedProjectsList = ({ projects, error, handleTaskClick, selectedTaskId }: JoinedProjectsListProps) => {
 return (
 <div className="mt-6">
 <div className="flex items-center justify-between px-2 mb-2">
 <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 ">Joined Projects</h2>
 <span className="bg-brand-50 text-brand-600 text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.25rem] text-center">
 {projects.length}
 </span>
 </div>
 {error ? (
 <div className="text-sm text-rose-400 px-3 py-4">{error}</div>
 ) : projects.length > 0 ? (
 <div className="space-y-1">
 {projects.map((project) => (
 <SidebarNavItem
 key={project.id}
 task={{ ...project, title: project.title || 'Untitled' }}
 isSelected={selectedTaskId === project.id}
 onClick={() => handleTaskClick(project)}
 showRole={true}
 to={`/project/${project.id}`}
 />
 ))}
 </div>
 ) : (
 <div className="text-sm text-muted-foreground px-3 py-4">
 You haven&apos;t joined any projects yet.
 </div>
 )}
 </div>
 );
};

export default JoinedProjectsList;
