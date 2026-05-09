import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TaskResourceRow } from '@/shared/db/app.types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ExternalLink, FileText, StickyNote, Plus, Trash2, Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { safeUrl } from '@/shared/lib/safe-url';
import { planter } from '@/shared/api/planterClient';

const resourceTypeIcons = {
 url: ExternalLink,
 pdf: FileText,
 text: StickyNote,
} as const;

const resourceTypeLabelKeys = {
 url: 'projects.resources.types.url',
 pdf: 'projects.resources.types.pdf',
 text: 'projects.resources.types.text',
} as const;

type ResourceType = keyof typeof resourceTypeIcons;

function normalizeResourceType(type: string | null | undefined): ResourceType {
 return type === 'pdf' || type === 'text' || type === 'url' ? type : 'url';
}

interface TaskResourcesProps {
 taskId: string;
 primaryResourceId?: string | null;
 onUpdate?: () => void;
}

export default function TaskResources({ taskId, primaryResourceId, onUpdate }: TaskResourcesProps) {
 const { t } = useTranslation();
 const [showAddModal, setShowAddModal] = useState(false);
 const [formData, setFormData] = useState({
 type: 'url' as ResourceType,
 resource_url: '',
 resource_text: '',
 storage_path: '',
 });

 const queryClient = useQueryClient();

 const { data: resources = [] } = useQuery<TaskResourceRow[]>({
 queryKey: ['resources', taskId],
 queryFn: () => planter.entities.TaskResource.filter({ task_id: taskId }),
 enabled: !!taskId,
 });

 const createResourceMutation = useMutation({
 mutationFn: (data: typeof formData) =>
 planter.entities.TaskResource.create({
 task_id: taskId,
 resource_type: data.type,
 resource_url: data.resource_url || null,
 resource_text: data.resource_text || null,
 storage_path: data.storage_path || null,
 storage_bucket: null,
 }),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['resources', taskId] });
 setShowAddModal(false);
 setFormData({ type: 'url', resource_url: '', resource_text: '', storage_path: '' });
 if (onUpdate) onUpdate();
 },
 });

 const deleteResourceMutation = useMutation({
 mutationFn: (id: string) => planter.entities.TaskResource.delete(id),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['resources', taskId] });
 if (onUpdate) onUpdate();
 },
 });

 const setPrimaryMutation = useMutation({
 mutationFn: (id: string) => planter.entities.TaskResource.setPrimary(taskId, id === primaryResourceId ? null : id),
 onSuccess: () => {
 if (onUpdate) onUpdate();
 },
 });

 const handleSubmit = (e: FormEvent) => {
 e.preventDefault();
 createResourceMutation.mutate(formData);
 };

 return (
 <div data-testid="task-resources">
 <div className="flex items-center justify-between mb-4">
 <h4 className="text-sm font-semibold text-card-foreground uppercase tracking-wider">{t('projects.resources.title')}</h4>
 <Button
 size="sm"
 onClick={() => setShowAddModal(true)}
 className="bg-brand-500 hover:bg-brand-600 text-white"
 >
 <Plus className="w-4 h-4 mr-1" />
 {t('projects.resources.add_button')}
 </Button>
 </div>

 <div className="space-y-2">
 {resources.length === 0 ? (
 <p className="text-sm text-muted-foreground py-4 text-center">{t('projects.resources.empty')}</p>
 ) : (
 resources.map((resource) => {
 const type = normalizeResourceType(resource.resource_type);
 const Icon = resourceTypeIcons[type] || FileText;
 const isPrimary = primaryResourceId === resource.id;
 const label = t(resourceTypeLabelKeys[type]);

 return (
 <div
 key={resource.id}
 className={cn(
 'flex items-center justify-between p-3 rounded-lg border transition-all',
 isPrimary
 ? 'bg-brand-50 border-brand-300 '
 : 'bg-card border-border hover:border-brand-300'
 )}
 >
 <div className="flex items-center gap-3 flex-1">
 <div
 className={cn(
 'w-9 h-9 rounded-lg flex items-center justify-center',
 isPrimary ? 'bg-brand-500' : 'bg-muted/50'
 )}
 >
 <Icon className={cn('w-4 h-4', isPrimary ? 'text-white' : 'text-muted-foreground')} />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-card-foreground truncate">
 {label}
 </p>
 {type === 'url' && resource.resource_url && (
 <a
 href={safeUrl(resource.resource_url)}
 target="_blank"
 rel="noopener noreferrer"
 className="text-xs text-brand-600 hover:underline truncate block"
 >
 {resource.resource_url}
 </a>
 )}
 {type === 'text' && resource.resource_text && (
 <p className="text-xs text-muted-foreground truncate">
 {resource.resource_text.substring(0, 50)}...
 </p>
 )}
 </div>
 </div>

 <div className="flex items-center gap-2">
 <Button
 size="icon"
 variant="ghost"
 onClick={() => setPrimaryMutation.mutate(resource.id)}
 aria-label={t(isPrimary ? 'projects.resources.unset_primary_aria' : 'projects.resources.set_primary_aria', { type: label })}
 className={cn('h-8 w-8', isPrimary && 'text-brand-600 hover:text-brand-700')}
 >
 <Star className={cn('w-4 h-4', isPrimary && 'fill-brand-600')} />
 </Button>
 <Button
 size="icon"
 variant="ghost"
 onClick={() => deleteResourceMutation.mutate(resource.id)}
 aria-label={t('projects.resources.delete_aria', { type: label })}
 className="h-8 w-8 text-rose-600 hover:bg-rose-50 "
 >
 <Trash2 className="w-4 h-4" />
 </Button>
 </div>
 </div>
 );
 })
 )}
 </div>

 <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
 <DialogContent className="sm:max-w-md bg-card text-card-foreground">
 <DialogHeader>
 <DialogTitle>{t('projects.resources.add_modal_title')}</DialogTitle>
 <DialogDescription>{t('projects.resources.add_modal_description')}</DialogDescription>
 </DialogHeader>
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <Label>{t('projects.resources.resource_type_label')}</Label>
 <Select
 value={formData.type}
 onValueChange={(value) => setFormData({ ...formData, type: value as ResourceType })}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="url">{t(resourceTypeLabelKeys.url)}</SelectItem>
 <SelectItem value="text">{t(resourceTypeLabelKeys.text)}</SelectItem>
 <SelectItem value="pdf">{t(resourceTypeLabelKeys.pdf)}</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {formData.type === 'url' && (
 <div>
 <Label>{t('projects.resources.url_label')}</Label>
 <Input
 type="url"
 value={formData.resource_url}
 onChange={(e) => setFormData({ ...formData, resource_url: e.target.value })}
 placeholder={t('projects.resources.url_placeholder')}
 required
 />
 </div>
 )}

 {formData.type === 'text' && (
 <div>
 <Label>{t('projects.resources.content_label')}</Label>
 <Textarea
 value={formData.resource_text}
 onChange={(e) => setFormData({ ...formData, resource_text: e.target.value })}
 placeholder={t('projects.resources.content_placeholder')}
 rows={4}
 required
 />
 </div>
 )}

 {formData.type === 'pdf' && (
 <div>
 <Label>{t('projects.resources.storage_path_label')}</Label>
 <Input
 value={formData.storage_path}
 onChange={(e) => setFormData({ ...formData, storage_path: e.target.value })}
 placeholder={t('projects.resources.storage_path_placeholder')}
 required
 />
 </div>
 )}

 <div className="flex gap-2 justify-end pt-4">
 <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
 {t('common.cancel')}
 </Button>
 <Button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white">
 {t('projects.resources.add_button')}
 </Button>
 </div>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 );
}
