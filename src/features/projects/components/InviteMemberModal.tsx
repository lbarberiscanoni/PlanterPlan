import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { planter } from '@/shared/api/planterClient';
import { ROLES } from '@/shared/constants';
import { Loader2 } from 'lucide-react';
import { useDirtyCloseGuard } from '@/shared/lib/use-dirty-close-guard';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/select';

interface InviteMemberModalProps {
    project: { id: string; title: string };
    onClose: () => void;
    onInviteSuccess?: () => void;
}

/**
 * Migrated from a hand-rolled `ReactDOM.createPortal` to Radix `Dialog`. The
 * previous implementation had no focus trap, no Escape handler, no
 * `aria-modal` / `role="dialog"`, and inconsistent styling vs. the rest of
 * the app (see UX audit ship-blocker #10). This rewrite inherits all of
 * those a11y properties from Radix Dialog + Select for free.
 */
const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ project, onClose, onInviteSuccess }) => {
    const { t } = useTranslation();
    const [userId, setUserId] = useState('');
    const [role, setRole] = useState<string>(ROLES.VIEWER);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Guard the close path — a mis-click on the backdrop after the user typed
    // an email prompts for Discard. `success === true` short-circuits the
    // guard because we auto-close 1.5s after a successful invite; prompting
    // there would be jarring.
    const isDirty = !success && (userId.trim().length > 0 || role !== ROLES.VIEWER);
    const guardedClose = useDirtyCloseGuard(isDirty, onClose);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!userId.trim()) {
            return;
        }

        const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

        if (!EMAIL_REGEX.test(userId) && !UUID_REGEX.test(userId)) {
            setError(t('projects.invite_modal.invalid_identifier'));
            return;
        }

        const isEmail = userId.includes('@');

        setIsSubmitting(true);
        setError(null);

        let result: { data?: unknown; error?: unknown };
        try {
            if (isEmail) {
                const res = await planter.entities.Project.addMemberByEmail(project.id, userId, role);
                result = { data: res, error: (res as { error?: unknown })?.error };
            } else {
                const res = await planter.entities.Project.addMember(project.id, userId, role);
                result = { data: res, error: (res as { error?: unknown })?.error };
            }
        } catch (err: unknown) {
            console.error('[InviteMemberModal] Exception during invite:', err);
            if (
                (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '42501') ||
                (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: string }).message === 'string' && (err as { message: string }).message.includes('policy'))
            ) {
                result = { error: t('projects.invite_modal.access_denied_owner') };
            } else {
                result = { error: err };
            }
        }

        const { error: inviteError } = result;

        if (inviteError) {
            const msg =
                (typeof inviteError === 'object' && inviteError !== null && 'message' in inviteError && typeof (inviteError as { message: string }).message === 'string')
                    ? (inviteError as { message: string }).message
                    : (typeof inviteError === 'string' ? inviteError : JSON.stringify(inviteError));
            console.error('[InviteMemberModal] Invite Failed:', msg);
            setError(msg || t('projects.invite_modal.invite_failed_unknown'));
            setIsSubmitting(false);
        } else {
            setIsSubmitting(false);
            setSuccess(true);
            if (onInviteSuccess) onInviteSuccess();
            // Delay close so the success state is visible (~1.5s is the
            // smallest span where a typical reader registers the emerald
            // banner without feeling blocked).
            setTimeout(() => {
                onClose();
            }, 1500);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) void guardedClose(); }}>
            <DialogContent data-testid="invite-member-modal" className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('projects.invite_modal.title')}</DialogTitle>
                    <DialogDescription>
                        {t('projects.invite_modal.description', { project: project.title })}
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
                        {error}
                    </div>
                )}
                {success && (
                    <div role="status" aria-live="polite" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200">
                        {t('projects.invite_modal.success')}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invite-userId">{t('projects.invite_modal.identifier_label')}</Label>
                        <Input
                            type="text"
                            id="invite-userId"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            placeholder={t('projects.invite_modal.identifier_placeholder')}
                            required
                            autoFocus
                            aria-describedby="invite-userId-hint"
                            autoComplete="email"
                        />
                        <p id="invite-userId-hint" className="text-xs text-muted-foreground">
                            {t('projects.invite_modal.identifier_hint')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="invite-role">{t('common.role')}</Label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger id="invite-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ROLES.VIEWER}>{t('projects.invite_modal.role_viewer')}</SelectItem>
                                <SelectItem value={ROLES.COACH}>{t('projects.invite_modal.role_coach')}</SelectItem>
                                <SelectItem value={ROLES.EDITOR}>{t('projects.invite_modal.role_editor')}</SelectItem>
                                <SelectItem value={ROLES.LIMITED}>{t('projects.invite_modal.role_limited')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void guardedClose()}
                            disabled={isSubmitting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
                            {isSubmitting ? t('projects.invite_modal.inviting') : t('projects.invite_modal.send_invite')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default InviteMemberModal;
