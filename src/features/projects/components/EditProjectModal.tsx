import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Switch } from '@/shared/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { useUpdateProject, useDeleteProject, useUpdateProjectStatus } from '@/features/projects/hooks/useProjectMutations';
import { applyProjectKind, extractProjectKind, type ProjectKind } from '@/features/projects/lib/project-kind';
import { toIsoDate } from '@/shared/lib/date-engine';
import { useDirtyCloseGuard } from '@/shared/lib/use-dirty-close-guard';
import { PROJECT_STATUS } from '@/shared/constants/domain';
import type { TaskRow } from '@/shared/db/app.types';
import { toast } from 'sonner';
import planter from '@/shared/api/planterClient';

const emailSchema = z.string().email();

interface SupervisorReportResponse {
 success?: boolean;
 payloads_dispatched?: number;
 dispatch_failures?: number;
}

interface EditProjectModalProps {
 project: TaskRow;
 isOpen: boolean;
 onClose: () => void;
}

export default function EditProjectModal({ project, isOpen, onClose }: EditProjectModalProps) {
 const { t } = useTranslation();
 const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
 const navigate = useNavigate();
 const updateProjectMutation = useUpdateProject();
 const deleteProjectMutation = useDeleteProject();
 const updateStatusMutation = useUpdateProjectStatus();
 const isTemplate = project.origin === 'template';
 const isArchived = project.status === PROJECT_STATUS.ARCHIVED;

 const editProjectSchema = useMemo(
  () =>
   z.object({
    title: z.string().min(1, t('projects.form.title_required_short')),
    description: z.string().optional(),
    start_date: isTemplate
     ? z.string().optional()
     : z.string().min(1, t('projects.form.start_date_required')),
    due_date: z.string().optional(),
    due_soon_threshold: z.coerce.number()
     .min(1, t('projects.edit_modal.due_soon_threshold_min'))
     .max(30, t('projects.edit_modal.due_soon_threshold_max')),
    supervisor_email: z.string().email(t('projects.edit_modal.supervisor_email_invalid')).optional().or(z.literal('')),
   }),
  [t, isTemplate],
 );

 type EditProjectFormData = z.infer<typeof editProjectSchema>;

 const handleArchiveToggle = async () => {
  const nextStatus = isArchived ? PROJECT_STATUS.IN_PROGRESS : PROJECT_STATUS.ARCHIVED;
  try {
   await updateStatusMutation.mutateAsync({ projectId: project.id, status: nextStatus });
   toast.success(isArchived ? t('projects.edit_modal.project_unarchived_toast') : t('projects.edit_modal.project_archived_toast'));
   onClose();
  } catch (error) {
   console.error('[EditProjectModal] Failed to toggle archive:', error);
   toast.error(t('projects.edit_modal.archive_toggle_failed'));
  }
 };

 const currentSettings = (project.settings as Record<string, unknown>) || {};
 const [isPublished, setIsPublished] = useState(currentSettings.published === true);
 const [projectKind, setProjectKind] = useState<ProjectKind>(() => extractProjectKind(project));
 const [pendingKindRevert, setPendingKindRevert] = useState(false);
 const isRoot = project.parent_task_id === null || project.parent_task_id === undefined;
 const isInstance = project.origin === 'instance';

 const [isSendingTest, setIsSendingTest] = useState(false);

 const {
  register,
  handleSubmit,
  control,
  formState: { errors, isSubmitting, isDirty: formIsDirty },
 } = useForm<EditProjectFormData>({
  // @ts-expect-error Zod schema mismatches slightly with final form data type
  resolver: zodResolver(editProjectSchema),
  defaultValues: {
   title: project.title || '',
   description: project.description || undefined,
   start_date: toIsoDate(project.start_date || project.created_at) || '',
   due_date: toIsoDate(project.due_date) || '',
   due_soon_threshold:
    typeof currentSettings.due_soon_threshold === 'number'
     ? currentSettings.due_soon_threshold
     : 3,
   supervisor_email: project.supervisor_email || '',
  },
 });

 const watchedSupervisorEmail = useWatch({ control, name: 'supervisor_email' }) ?? '';
 const trimmedSupervisorEmail = watchedSupervisorEmail.trim();
 const isSupervisorEmailValid = emailSchema.safeParse(trimmedSupervisorEmail).success;
 const canSendTestReport = Boolean(project.id) && isSupervisorEmailValid && !isSendingTest;

 // Dirty detection: RHF's `formState.isDirty` tracks the 6 form fields.
 // `isPublished` (template) and `projectKind` (instance root) are managed
 // outside RHF via useState, so they need separate comparisons against
 // the values loaded from the project at mount. `pendingKindRevert` is
 // an internal UI flag (not user data), not tracked.
 const initialPublished = useMemo(() => currentSettings.published === true, [currentSettings.published]);
 const initialKind = useMemo(() => extractProjectKind(project), [project]);
 const isDirty =
  formIsDirty ||
  (isTemplate && isPublished !== initialPublished) ||
  (isRoot && isInstance && projectKind !== initialKind);
 const guardedClose = useDirtyCloseGuard(isDirty, onClose);

 const handleSendTestReport = async () => {
  if (!canSendTestReport) return;
  setIsSendingTest(true);
  try {
   const { data, error } = await planter.functions.invoke<SupervisorReportResponse>(
    'supervisor-report',
    { body: { project_id: project.id, dry_run: false } },
   );
   if (error || !data?.success || (data.payloads_dispatched ?? 0) < 1) {
    toast.error(t('projects.edit_modal.test_report_failed'));
    return;
   }
   toast.success(t('projects.edit_modal.test_report_sent'));
  } catch (error) {
   console.error('[EditProjectModal] test report dispatch failed', error);
   toast.error(t('projects.edit_modal.test_report_failed'));
  } finally {
   setIsSendingTest(false);
  }
 };

 const onSubmit = async (data: EditProjectFormData) => {
  try {
   const oldStartDate = toIsoDate(project.start_date || project.created_at);
   const { due_soon_threshold, due_date, supervisor_email, ...rest } = data;

   const mergedSettings = {
    ...currentSettings,
    due_soon_threshold,
    ...(isTemplate ? { published: isPublished } : {}),
   };
   const settingsWithKind = isRoot && isInstance
    ? applyProjectKind(mergedSettings, projectKind) ?? mergedSettings
    : mergedSettings;

   const updateData = {
    ...rest,
    due_date: due_date ? due_date : null,
    supervisor_email: supervisor_email ? supervisor_email : null,
    settings: settingsWithKind,
   };

   const result = await updateProjectMutation.mutateAsync({
    projectId: project.id,
    updates: updateData as Record<string, unknown>,
    oldStartDate,
   });
   if (result.shiftedCount > 0) {
    toast.success(t('projects.edit_modal.project_saved_with_shift', { count: result.shiftedCount }));
   } else {
    toast.success(t('projects.edit_modal.project_saved_toast'));
   }
   onClose();
  } catch (error) {
   console.error('[EditProjectModal] Failed to update project:', error);
  }
 };

 return (
  <>
  <Dialog open={isOpen} onOpenChange={(o) => { if (!o) void guardedClose(); }}>
   <DialogContent data-testid="edit-project-modal" className="sm:max-w-[500px]">
    <DialogHeader>
     <DialogTitle>{t('projects.edit_modal.title')}</DialogTitle>
     <DialogDescription>{t('projects.edit_modal.description')}</DialogDescription>
    </DialogHeader>

    <div className="space-y-6 py-4">
     <div className="space-y-4">
      <Label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('projects.edit_modal.section_general')}</Label>
      <div className="grid gap-2">
       <Label htmlFor="title">{t('projects.form.title_label')}</Label>
       <Input
        id="title"
        {...register('title')}
        className={errors.title ? 'border-red-500' : ''}
       />
       {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
      </div>

      <div className="grid gap-2">
       <Label htmlFor="description">{t('projects.form.description_label')}</Label>
       <Textarea id="description" {...register('description')} rows={2} />
      </div>
     </div>

     <div className="space-y-4">
      <Label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('projects.edit_modal.section_configuration')}</Label>
      <div className="grid gap-2">
       <Label htmlFor="due_soon_threshold">{t('projects.edit_modal.due_soon_threshold_label')}</Label>
       <Input
        type="number"
        id="due_soon_threshold"
        {...register('due_soon_threshold')}
        min="1"
        max="30"
       />
       {errors.due_soon_threshold && (
        <p className="text-sm text-red-500">{errors.due_soon_threshold.message}</p>
       )}
       <p className="text-xs text-slate-500">{t('projects.edit_modal.due_soon_threshold_description')}</p>
      </div>

      {!isTemplate && (
       <div className="grid gap-2">
        <Label htmlFor="supervisor_email">{t('projects.edit_modal.supervisor_email_label')}</Label>
        <Input
         type="email"
         id="supervisor_email"
         placeholder={t('projects.edit_modal.supervisor_email_placeholder')}
         {...register('supervisor_email')}
         className={errors.supervisor_email ? 'border-red-500' : ''}
        />
        {errors.supervisor_email && (
         <p className="text-sm text-red-500">{errors.supervisor_email.message}</p>
        )}
        <div className="flex items-center justify-between gap-2">
         <p className="text-xs text-slate-500">
          {t('projects.edit_modal.supervisor_email_description')}
         </p>
         <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="send-test-report-btn"
          onClick={handleSendTestReport}
          disabled={!canSendTestReport}
         >
          {isSendingTest ? t('projects.edit_modal.sending_test_report') : t('projects.edit_modal.send_test_report')}
         </Button>
        </div>
       </div>
      )}

      {isTemplate && (
       <div className="flex items-center justify-between py-2">
        <div>
         <Label htmlFor="published-toggle" className="font-medium">{t('projects.edit_modal.published_label')}</Label>
         <p className="text-xs text-slate-500 mt-0.5">{t('projects.edit_modal.published_description')}</p>
        </div>
        <Switch
         id="published-toggle"
         checked={isPublished}
         onCheckedChange={setIsPublished}
        />
       </div>
      )}

      {isRoot && isInstance && (
       <div className="grid gap-2 py-2" data-testid="project-kind-section">
        <Label className="font-medium">{t('projects.edit_modal.project_type_label')}</Label>
        <p className="text-xs text-slate-500">
         {t('projects.edit_modal.project_type_description')}
        </p>
        <RadioGroup
         value={projectKind}
         onValueChange={(v) => {
          const next = v as ProjectKind;
          if (projectKind === 'checkpoint' && next === 'date') {
           setPendingKindRevert(true);
           return;
          }
          setProjectKind(next);
         }}
         className="flex flex-col gap-2"
        >
         <div className="flex items-center gap-2">
          <RadioGroupItem value="date" id="kind-date" />
          <Label htmlFor="kind-date" className="font-normal">{t('projects.edit_modal.kind_date')}</Label>
         </div>
         <div className="flex items-center gap-2">
          <RadioGroupItem value="checkpoint" id="kind-checkpoint" />
          <Label htmlFor="kind-checkpoint" className="font-normal">{t('projects.edit_modal.kind_checkpoint')}</Label>
         </div>
        </RadioGroup>
       </div>
      )}
     </div>

     {!isTemplate && (
     <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 space-y-4">
      <div>
       <Label htmlFor="start_date" className="block mb-1 font-semibold text-amber-800">
        {t('projects.edit_modal.launch_date_correction')}
       </Label>
       <p className="text-xs text-amber-700 mb-2">
        {t('projects.edit_modal.launch_date_warning')}
       </p>
       <Input
        type="date"
        id="start_date"
        {...register('start_date')}
        className={errors.start_date ? 'border-red-500' : ''}
       />
       {errors.start_date && <p className="text-sm text-red-500">{errors.start_date.message}</p>}
      </div>

      <div>
       <Label htmlFor="due_date" className="block mb-1 font-semibold text-amber-800">
        {t('projects.edit_modal.due_date_label')}
       </Label>
       <Input type="date" id="due_date" {...register('due_date')} />
      </div>
     </div>
     )}

     <div className="flex justify-end gap-3 pt-2">
      <Button variant="outline" onClick={() => void guardedClose()} type="button">
       {t('common.cancel')}
      </Button>
      <Button onClick={handleSubmit(onSubmit as (data: unknown) => void)} disabled={isSubmitting}>
       {isSubmitting ? t('projects.edit_modal.saving') : t('common.save_changes')}
      </Button>
     </div>

     {!isTemplate && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
       <div className="flex items-center justify-between gap-3">
        <div>
         <Label className="block mb-1 font-semibold text-amber-800">
          {isArchived ? t('projects.edit_modal.unarchive_heading') : t('projects.edit_modal.archive_heading')}
         </Label>
         <p className="text-xs text-amber-700">
          {isArchived
           ? t('projects.edit_modal.unarchive_description')
           : t('projects.edit_modal.archive_description')}
         </p>
        </div>
        <Button
         variant="outline"
         size="sm"
         data-testid="archive-project-btn"
         onClick={handleArchiveToggle}
         disabled={updateStatusMutation.isPending}
         className="border-amber-300 text-amber-800 hover:bg-amber-100"
        >
         {updateStatusMutation.isPending
          ? (isArchived ? t('projects.edit_modal.unarchiving') : t('projects.edit_modal.archiving'))
          : (isArchived ? t('projects.edit_modal.unarchive_button') : t('projects.edit_modal.archive_button'))}
        </Button>
       </div>
      </div>
     )}

     <div className="relative py-4">
      <div className="absolute inset-0 flex items-center">
       <span className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
       <span className="bg-white px-2 text-slate-500">{t('projects.edit_modal.danger_zone')}</span>
      </div>
     </div>

     <div className="bg-red-50 p-4 rounded-lg border border-red-200">
      <div className="flex items-center justify-between">
       <div>
        <Label className="block mb-1 font-semibold text-red-800">{t('projects.edit_modal.delete_heading')}</Label>
        <p className="text-xs text-red-700">{t('projects.edit_modal.delete_description')}</p>
       </div>
       {!showDeleteConfirm ? (
        <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>
         {t('projects.edit_modal.delete_button')}
        </Button>
       ) : (
        <div className="flex items-center gap-2">
         <span className="text-xs text-red-700 font-medium">{t('projects.edit_modal.delete_confirm_prompt')}</span>
         <Button
          variant="outline"
          size="sm"
          className="h-8 text-slate-600 bg-white hover:bg-slate-50 border-red-200"
          onClick={() => setShowDeleteConfirm(false)}
         >
          {t('common.cancel')}
         </Button>
         <Button
          variant="destructive"
          size="sm"
          className="h-8"
          onClick={async () => {
           await deleteProjectMutation.mutateAsync(project.id);
           navigate('/dashboard', { replace: true });
          }}
         >
          {t('projects.edit_modal.delete_confirm_yes')}
         </Button>
        </div>
       )}
      </div>
     </div>
    </div>
   </DialogContent>
  </Dialog>

  <Dialog open={pendingKindRevert} onOpenChange={setPendingKindRevert}>
   <DialogContent role="alertdialog" data-testid="project-kind-revert-dialog" className="sm:max-w-md">
    <DialogHeader>
     <DialogTitle>{t('projects.edit_modal.revert_kind_title')}</DialogTitle>
     <DialogDescription>
      {t('projects.edit_modal.revert_kind_description')}
     </DialogDescription>
    </DialogHeader>
    <DialogFooter className="gap-2 sm:justify-end">
     <Button variant="outline" onClick={() => setPendingKindRevert(false)}>
      {t('common.cancel')}
     </Button>
     <Button
      variant="destructive"
      onClick={() => {
       setProjectKind('date');
       setPendingKindRevert(false);
      }}
     >
      {t('projects.edit_modal.revert_kind_confirm')}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
  </>
 );
}
