import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

/**
 * App-wide confirmation dialog — the single replacement for the browser's
 * native `window.confirm`. Native confirms are unstyled, untranslatable,
 * inconsistent across platforms, and (on Firefox) focus-trap the entire
 * browser chrome in a way screen readers handle inconsistently.
 *
 * ## Imperative API (recommended)
 *
 * Wrap the app in `<ConfirmDialogProvider>` (done once in `App.tsx`), then
 * call `useConfirm()` from any component:
 *
 * ```tsx
 * const confirm = useConfirm();
 * const handleDelete = async () => {
 *   const ok = await confirm({
 *     title: t('tasks.delete_title'),
 *     description: t('tasks.delete_description'),
 *     confirmText: t('common.delete'),
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *   await deleteTask();
 * };
 * ```
 *
 * Returns `true` on confirm, `false` on cancel / esc / backdrop dismissal.
 *
 * ## Accessibility contract
 *
 * - Radix Dialog provides focus trap + return-focus.
 * - Cancel button autofocuses (matches WAI-ARIA Alert Dialog best practice
 *   for destructive confirms — keyboard users default to the "safe" action).
 * - `DialogDescription` is always present → Radix stops warning about a
 *   missing description and screen readers announce both title + body.
 * - Esc and backdrop click map to cancel (returns `false`) by default.
 */

export interface ConfirmDialogOptions {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    /** When true, the confirm button is rendered in a destructive color scheme. */
    destructive?: boolean;
}

type Resolver = (value: boolean) => void;

interface State {
    open: boolean;
    options: ConfirmDialogOptions | null;
    resolver: Resolver | null;
}

const ConfirmDialogContext = React.createContext<
    ((options: ConfirmDialogOptions) => Promise<boolean>) | null
>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const [state, setState] = React.useState<State>({
        open: false,
        options: null,
        resolver: null,
    });

    const confirm = React.useCallback<(options: ConfirmDialogOptions) => Promise<boolean>>(
        (options) =>
            new Promise<boolean>((resolve) => {
                setState({ open: true, options, resolver: resolve });
            }),
        [],
    );

    const close = React.useCallback((result: boolean) => {
        setState((prev) => {
            prev.resolver?.(result);
            return { open: false, options: prev.options, resolver: null };
        });
    }, []);

    const options = state.options;

    return (
        <ConfirmDialogContext.Provider value={confirm}>
            {children}
            <Dialog
                open={state.open}
                onOpenChange={(open) => {
                    // Radix fires onOpenChange(false) on esc + backdrop +
                    // close-button → all route through cancel.
                    if (!open) close(false);
                }}
            >
                <DialogContent
                    className="sm:max-w-md"
                    // Alert-dialog semantics for destructive confirms: assertive
                    // announcement is exactly what screen readers need here.
                    role={options?.destructive ? 'alertdialog' : 'dialog'}
                >
                    <DialogHeader>
                        <DialogTitle>{options?.title ?? ''}</DialogTitle>
                        <DialogDescription>{options?.description ?? ''}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => close(false)}
                            autoFocus
                        >
                            {options?.cancelText ?? t('common.cancel')}
                        </Button>
                        <Button
                            onClick={() => close(true)}
                            className={cn(
                                options?.destructive &&
                                    'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                            )}
                        >
                            {options?.confirmText ?? t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ConfirmDialogContext.Provider>
    );
}

export function useConfirm() {
    const ctx = React.useContext(ConfirmDialogContext);
    if (!ctx) {
        throw new Error('useConfirm must be used inside <ConfirmDialogProvider>');
    }
    return ctx;
}
