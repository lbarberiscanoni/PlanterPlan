import { useNavigate } from 'react-router-dom';
import { useTaskQuery } from '@/features/tasks/hooks/useTaskQuery';
import ProjectSidebar from '@/features/navigation/components/ProjectSidebar';

export interface ProjectSidebarContainerProps {
 onNavClick?: () => void;
 selectedTaskId?: string | null;
}

export default function ProjectSidebarContainer({ onNavClick, selectedTaskId }: ProjectSidebarContainerProps) {
 const navigate = useNavigate();
 const {
 tasks = [],
 joinedTemplates,
 templatesLoading,
 joinedTemplatesLoading,
 error,
 } = useTaskQuery();

 const templateTasks = tasks.filter((t) => t.origin === 'template');

 const handleSelectProject = (project: { id: string }) => {
 navigate(`/project/${project.id}`);
 };

 const handleNewTemplateClick = () => {
 navigate('/tasks?action=new-template');
 };

 return (
 <ProjectSidebar
 templateTasks={templateTasks}
 sharedTemplates={joinedTemplates}
 templatesLoading={templatesLoading}
 sharedTemplatesLoading={joinedTemplatesLoading}
 error={error}
 handleSelectProject={handleSelectProject}
 selectedTaskId={selectedTaskId}
 onNewTemplateClick={handleNewTemplateClick}
 onNavClick={onNavClick}
 />
 );
}
