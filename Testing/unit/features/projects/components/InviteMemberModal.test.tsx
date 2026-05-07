import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InviteMemberModal from '@/features/projects/components/InviteMemberModal';

const mockInviteMemberByEmail = vi.hoisted(() => vi.fn());
const mockAddMember = vi.hoisted(() => vi.fn());

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            Project: {
                inviteMemberByEmail: mockInviteMemberByEmail,
                addMember: mockAddMember,
            },
        },
    },
}));

vi.mock('@/shared/lib/use-dirty-close-guard', () => ({
    useDirtyCloseGuard: (_isDirty: boolean, onClose: () => void) => onClose,
}));

const project = { id: 'project-1', title: 'Project One' };

describe('InviteMemberModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the invite-by-email client method for email identifiers', async () => {
        const onInviteSuccess = vi.fn();
        mockInviteMemberByEmail.mockResolvedValue({
            message: 'Invite processed successfully',
            user: { id: 'member-1', email: 'new@example.com' },
        });

        render(
            <InviteMemberModal
                project={project}
                onClose={vi.fn()}
                onInviteSuccess={onInviteSuccess}
            />,
        );

        fireEvent.change(screen.getByLabelText(/user email or uuid/i), {
            target: { value: 'New@Example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

        await waitFor(() => {
            expect(mockInviteMemberByEmail).toHaveBeenCalledWith('project-1', 'New@Example.com', 'viewer');
        });
        expect(mockAddMember).not.toHaveBeenCalled();
        expect(onInviteSuccess).toHaveBeenCalled();
    });

    it('surfaces owner-only invite failures without falling back to UUID membership', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockInviteMemberByEmail.mockRejectedValue(new Error('Forbidden: only project owners can invite users.'));

        render(
            <InviteMemberModal
                project={project}
                onClose={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByLabelText(/user email or uuid/i), {
            target: { value: 'blocked@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden: only project owners can invite users.');
        expect(mockInviteMemberByEmail).toHaveBeenCalledTimes(1);
        expect(mockAddMember).not.toHaveBeenCalled();
    });
});
