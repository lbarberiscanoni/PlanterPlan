import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useDirtyCloseGuard } from '@/shared/lib/use-dirty-close-guard';

interface PersonFormData {
 first_name: string;
 last_name?: string | null;
 email?: string | null;
 phone?: string | null;
 role?: string | null;
 status?: string | null;
 notes?: string | null;
}

interface AddPersonModalProps {
 open: boolean;
 onClose: () => void;
 onSave: (data: PersonFormData) => Promise<void>;
 initialData?: PersonFormData | null;
}

const ROLES = ['Volunteer', 'Core Team', 'Donor', 'Staff', 'Planter'] as const;
const STATUSES = ['New', 'Contacted', 'Meeting Scheduled', 'Joined', 'Not Interested'] as const;

const DEFAULT_FORM: PersonFormData = {
 first_name: '',
 last_name: '',
 email: '',
 phone: '',
 role: 'Volunteer',
 status: 'New',
 notes: '',
};

export default function AddPersonModal({ open, onClose, onSave, initialData = null }: AddPersonModalProps) {
 const { t } = useTranslation();
 const [loading, setLoading] = useState(false);
 const [formData, setFormData] = useState<PersonFormData>(initialData || DEFAULT_FORM);

 // Dirty-state detection via JSON-string equality against the original
 // data (or the empty-form defaults when creating). Cheap enough —
 // PersonFormData has 7 scalar fields. On close intent, the guard
 // prompts for Discard confirmation if anything changed.
 const isDirty = useMemo(() => {
  const baseline = initialData ?? DEFAULT_FORM;
  return JSON.stringify(formData) !== JSON.stringify(baseline);
 }, [formData, initialData]);

 const guardedClose = useDirtyCloseGuard(isDirty, onClose);

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 setLoading(true);
 try {
 await onSave(formData);
 onClose();
 } catch (error) {
 console.error(error);
 } finally {
 setLoading(false);
 }
 };

 return (
 <Dialog open={open} onOpenChange={(o) => { if (!o) void guardedClose(); }}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{initialData ? t('projects.people.modal.edit_title') : t('projects.people.modal.add_title')}</DialogTitle>
 </DialogHeader>

 <form onSubmit={handleSubmit} className="space-y-4 py-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="person-first-name">
  {t('projects.people.modal.first_name_label')} <span className="text-red-500" aria-hidden="true">*</span>
 </Label>
 <Input
 id="person-first-name"
 value={formData.first_name || ''}
 onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
 required
 autoFocus
 autoComplete="given-name"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="person-last-name">{t('projects.people.modal.last_name_label')}</Label>
 <Input
 id="person-last-name"
 value={formData.last_name || ''}
 onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
 autoComplete="family-name"
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="person-email">{t('projects.people.modal.email_label')}</Label>
 <Input
 id="person-email"
 type="email"
 value={formData.email || ''}
 onChange={(e) => setFormData({ ...formData, email: e.target.value })}
 autoComplete="email"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="person-phone">{t('projects.people.modal.phone_label')}</Label>
 <Input
 id="person-phone"
 type="tel"
 value={formData.phone || ''}
 onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
 autoComplete="tel"
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="person-role">{t('projects.people.modal.role_label')}</Label>
 <Select
 value={formData.role || 'Volunteer'}
 onValueChange={(val) => setFormData({ ...formData, role: val })}
 >
 <SelectTrigger id="person-role"><SelectValue /></SelectTrigger>
 <SelectContent>
 {ROLES.map(r => <SelectItem key={r} value={r}>{t(`projects.people.roles.${r}` as never, { defaultValue: r })}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label htmlFor="person-status">{t('projects.people.modal.status_label')}</Label>
 <Select
 value={formData.status || 'New'}
 onValueChange={(val) => setFormData({ ...formData, status: val })}
 >
 <SelectTrigger id="person-status"><SelectValue /></SelectTrigger>
 <SelectContent>
 {STATUSES.map(s => <SelectItem key={s} value={s}>{t(`projects.people.statuses.${s}` as never, { defaultValue: s })}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="person-notes">{t('projects.people.modal.notes_label')}</Label>
 <Textarea
 id="person-notes"
 value={formData.notes || ''}
 onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
 placeholder={t('projects.people.modal.notes_placeholder')}
 />
 </div>

 <DialogFooter>
 <Button type="button" variant="ghost" onClick={() => void guardedClose()}>{t('common.cancel')}</Button>
 <Button type="submit" disabled={loading} className="bg-brand-600 hover:bg-brand-700 text-white">
 {loading && <Loader2 aria-hidden="true" className="w-4 h-4 mr-2 animate-spin" />}
 {initialData ? t('common.save_changes') : t('projects.people.modal.add_button')}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 );
}
