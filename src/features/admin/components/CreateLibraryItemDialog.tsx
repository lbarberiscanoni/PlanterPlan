import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/shared/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/select';
import { Label } from '@/shared/ui/label';
import TaskForm from '@/features/tasks/components/TaskForm';
import type { TaskFormData, LibraryItemType } from '@/shared/db/app.types';
import type { CreateLibraryItemPayload } from '@/features/admin/hooks/useLibraryItemMutations';

const ITEM_TYPES: LibraryItemType[] = ['phase', 'milestone', 'task'];

export interface CreateLibraryItemDialogProps {
    open: boolean;
    onClose: () => void;
    /** Persists the new loose library item. Resolves on success, rejects to keep the form open. */
    onCreate: (payload: Omit<CreateLibraryItemPayload, 'userId'>) => Promise<void>;
}

/**
 * "Add Item" popup for the Master Library. Reuses the same full-field
 * `TaskForm` (origin='template') used when authoring a task inside a template,
 * adding the explicit phase/milestone/task type selector that loose library
 * items require (type is otherwise depth-derived inside a real template tree).
 */
export default function CreateLibraryItemDialog({ open, onClose, onCreate }: CreateLibraryItemDialogProps) {
    const { t } = useTranslation();
    const [taskType, setTaskType] = useState<LibraryItemType>('phase');

    const handleSubmit = async (data: TaskFormData) => {
        await onCreate({
            title: data.title,
            description: data.description ?? '',
            taskType,
            daysFromStart:
                data.days_from_start === undefined || data.days_from_start === null
                    ? 0
                    : Number(data.days_from_start),
            duration:
                data.duration === undefined || data.duration === null
                    ? 0
                    : Number(data.duration),
            purpose: data.purpose ?? null,
            actions: data.actions ?? null,
            notes: data.notes ?? null,
        });
    };

    const typeLabel = (type: LibraryItemType) => {
        switch (type) {
            case 'phase':
                return t('admin.library_type_phase');
            case 'milestone':
                return t('admin.library_type_milestone');
            default:
                return t('admin.library_type_task');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent
                data-testid="create-library-item-dialog"
                className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]"
            >
                <DialogHeader>
                    <DialogTitle>{t('admin.library_form_create_title')}</DialogTitle>
                    <DialogDescription>{t('admin.library_form_future_note')}</DialogDescription>
                </DialogHeader>

                <div className="mb-2 flex flex-col gap-1">
                    <Label className="text-sm font-medium text-slate-700">{t('admin.library_form_type_label')}</Label>
                    <Select value={taskType} onValueChange={(v) => setTaskType(v as LibraryItemType)}>
                        <SelectTrigger className="w-full bg-card" data-testid="create-library-item-type">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ITEM_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>{typeLabel(type)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <TaskForm
                    origin="template"
                    submitLabel={t('admin.library_form_create_submit')}
                    onSubmit={handleSubmit}
                    onCancel={onClose}
                />
            </DialogContent>
        </Dialog>
    );
}
