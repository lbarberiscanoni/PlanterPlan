import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Trans, useTranslation } from 'react-i18next';

interface LibraryTask {
    id: string;
    title?: string;
    description?: string;
    purpose?: string;
    actions?: string;
    notes?: string;
    [key: string]: unknown;
}

interface NewProjectFormProps {
    onSubmit: (data: ProjectFormData) => Promise<void>;
    onCancel: () => void;
    renderLibrarySearch?: (onSelect: (task: LibraryTask) => void) => ReactNode;
}

type ProjectFormData = {
    title: string;
    description?: string;
    purpose?: string;
    actions?: string;
    notes?: string;
    start_date: string;
    templateId?: string | null;
};

const defaultValues: ProjectFormData = {
    title: '',
    description: '',
    purpose: '',
    actions: '',
    notes: '',
    start_date: '',
    templateId: null,
};

const NewProjectForm = ({ onSubmit, onCancel, renderLibrarySearch }: NewProjectFormProps) => {
    const { t } = useTranslation();
    const [lastAppliedTaskTitle, setLastAppliedTaskTitle] = useState('');

    const projectSchema = useMemo(
        () =>
            z.object({
                title: z.string().min(1, t('projects.form.title_required')),
                description: z.string().optional(),
                purpose: z.string().optional(),
                actions: z.string().optional(),
                notes: z.string().optional(),
                start_date: z.string().min(1, t('projects.form.start_date_required')),
                templateId: z.string().nullable().optional(),
            }),
        [t],
    );

    const {
        register,
        handleSubmit,
        setValue,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ProjectFormData>({
        resolver: zodResolver(projectSchema),
        defaultValues,
    });

    const handleApplyFromLibrary = (task: LibraryTask) => {
        if (!task) return;
        setValue('title', task.title || '', { shouldValidate: true });
        setValue('description', task.description || '', { shouldValidate: true });
        setValue('purpose', task.purpose || '', { shouldValidate: true });
        setValue('actions', task.actions || '', { shouldValidate: true });
        setValue('notes', task.notes || '', { shouldValidate: true });
        setValue('templateId', task.id || null, { shouldValidate: true });
        setLastAppliedTaskTitle(task.title || '');
    };

    const handleFormSubmit = async (data: ProjectFormData) => {
        try {
            await onSubmit(data);
            reset(defaultValues);
            setLastAppliedTaskTitle('');
        } catch (e) {
            console.error('Submission failed', e);
        }
    };

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="project-form">
            {renderLibrarySearch && (
                <div className="form-group">
                    {renderLibrarySearch(handleApplyFromLibrary)}
                </div>
            )}

            {lastAppliedTaskTitle && (
                <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    <Trans
                        i18nKey="projects.form.copied_from"
                        values={{ title: lastAppliedTaskTitle }}
                        components={{ strong: <span className="font-semibold" /> }}
                    />
                </div>
            )}

            {errors.root?.message && <div className="form-error-banner">{errors.root.message}</div>}

            <div className="form-group">
                <label htmlFor="title" className="form-label">
                    {t('projects.form.title_label')} <span className="required">{t('projects.form.required_marker')}</span>
                </label>
                <input
                    type="text"
                    id="title"
                    autoFocus
                    className={`form-input ${errors.title ? 'error' : ''}`}
                    placeholder={t('projects.form.title_placeholder')}
                    {...register('title')}
                />
                {errors.title && <span className="form-error">{errors.title.message}</span>}
            </div>

            <div className="form-group">
                <label htmlFor="description" className="form-label">
                    {t('projects.form.description_label')}
                </label>
                <textarea
                    id="description"
                    className="form-textarea"
                    placeholder={t('projects.form.description_placeholder')}
                    rows={4}
                    {...register('description')}
                />
            </div>

            <div className="form-group">
                <label htmlFor="purpose" className="form-label">
                    {t('projects.form.purpose_label')}
                </label>
                <textarea
                    id="purpose"
                    className="form-textarea"
                    placeholder={t('projects.form.purpose_placeholder')}
                    rows={3}
                    {...register('purpose')}
                />
            </div>

            <div className="form-group">
                <label htmlFor="start_date" className="form-label">
                    {t('projects.form.start_date_label')} <span className="required">{t('projects.form.required_marker')}</span>
                </label>
                <input
                    type="date"
                    id="start_date"
                    className={`form-input ${errors.start_date ? 'error' : ''}`}
                    {...register('start_date')}
                />
                {errors.start_date && <span className="form-error">{errors.start_date.message}</span>}
            </div>

            <div className="form-actions mt-6 flex justify-end space-x-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={onCancel} className="btn-secondary" disabled={isSubmitting}>
                    {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? t('projects.form.creating') : t('projects.form.create')}
                </button>
            </div>
        </form>
    );
};

export default NewProjectForm;
