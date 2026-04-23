import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/shared/ui/confirm-dialog';

/**
 * Returns a `guardedClose` function that prompts the user to confirm discarding
 * unsaved changes before firing `onClose`. If `isDirty` is false, the close
 * fires immediately with no prompt.
 *
 * Intended for modal dialogs (AddPerson, InviteMember, CreateProject, …) where
 * the user may type 20 fields worth of data and a single mis-click on the
 * backdrop or Esc key loses it all. Pattern:
 *
 * ```tsx
 * const isDirty = JSON.stringify(formData) !== JSON.stringify(initial);
 * const guardedClose = useDirtyCloseGuard(isDirty, onClose);
 *
 * <Dialog open={open} onOpenChange={(o) => { if (!o) void guardedClose(); }}>
 * ```
 *
 * The returned function is async (returns a Promise<void>) so callers can
 * `await` in flows like "save-and-close". Fire-and-forget with `void` when
 * the result doesn't matter.
 */
export function useDirtyCloseGuard(isDirty: boolean, onClose: () => void) {
    const { t } = useTranslation();
    const confirm = useConfirm();

    return useCallback(async () => {
        if (!isDirty) {
            onClose();
            return;
        }
        const ok = await confirm({
            title: t('common.discard_confirm_title'),
            description: t('common.discard_confirm_description'),
            confirmText: t('common.discard'),
            cancelText: t('common.keep_editing'),
            destructive: true,
        });
        if (ok) onClose();
    }, [isDirty, onClose, confirm, t]);
}
