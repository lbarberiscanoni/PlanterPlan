import { useTranslation } from 'react-i18next';
import SidebarNavItem from '@/shared/ui/SidebarNavItem';

interface SharedTemplate {
 id: string;
 title?: string;
 membership_role?: string;
 [key: string]: unknown;
}

interface SharedTemplatesListProps {
 templates: SharedTemplate[];
 error?: string | null;
 handleTaskClick: (template: SharedTemplate) => void;
 selectedTaskId?: string | null;
}

const SharedTemplatesList = ({ templates = [], error, handleTaskClick, selectedTaskId }: SharedTemplatesListProps) => {
 const { t } = useTranslation();
 return (
 <div className="mt-6">
 <div className="flex items-center justify-between px-2 mb-2">
 <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 ">{t('nav.shared_templates')}</h2>
 <span className="bg-brand-50 text-brand-600 text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.25rem] text-center">
 {templates.length}
 </span>
 </div>
 {error ? (
 <div className="text-sm text-rose-400 px-3 py-4">{error}</div>
 ) : templates.length > 0 ? (
 <div className="space-y-1">
 {templates.map((template) => (
 <SidebarNavItem
 key={template.id}
 task={{ ...template, title: template.title || 'Untitled' }}
 isSelected={selectedTaskId === template.id}
 onClick={() => handleTaskClick(template)}
 showRole={true}
 to={`/project/${template.id}`}
 />
 ))}
 </div>
 ) : (
 <div className="text-sm text-muted-foreground px-3 py-4">
 {t('nav.shared_templates_empty')}
 </div>
 )}
 </div>
 );
};

export default SharedTemplatesList;
