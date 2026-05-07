import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import type { ReactNode } from 'react';
import type { TaskFormData, TeamMemberWithProfile } from '@/shared/db/app.types';

const mockTeamMembers = [
    { id: 'tm1', user_id: 'u-viewer-1', project_id: 'p1', role: 'viewer', joined_at: null, email: 'viewer1@test.local' },
    { id: 'tm2', user_id: 'u-limited-1', project_id: 'p1', role: 'limited', joined_at: null, email: 'limited@test.local' },
    { id: 'tm3', user_id: 'u-editor-1', project_id: 'p1', role: 'editor', joined_at: null, email: 'editor@test.local' },
    { id: 'tm4', user_id: 'u-owner-1', project_id: 'p1', role: 'owner', joined_at: null, email: 'owner@test.local' },
];

vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({ user: { id: 'viewer-self', role: 'user' } }),
}));

import TaskFormFields from '@/features/tasks/components/TaskFormFields';

function Harness({
    children,
    defaults,
}: {
    children: ReactNode;
    defaults?: Partial<TaskFormData>;
}) {
    const methods = useForm<TaskFormData>({
        defaultValues: { title: '', phase_lead_user_ids: [], ...defaults } as TaskFormData,
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
}

describe('TaskFormFields — Phase Lead picker (Wave 29)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the picker for an owner editing a phase', () => {
        render(
            <Harness>
                <TaskFormFields origin="instance" membershipRole="owner" taskType="phase" projectId="p1" teamMembers={mockTeamMembers as TeamMemberWithProfile[]} />
            </Harness>,
        );
        expect(screen.getByTestId('phase-lead-picker')).toBeInTheDocument();
    });

    it('renders the picker for an owner editing a milestone', () => {
        render(
            <Harness>
                <TaskFormFields origin="instance" membershipRole="owner" taskType="milestone" projectId="p1" teamMembers={mockTeamMembers as TeamMemberWithProfile[]} />
            </Harness>,
        );
        expect(screen.getByTestId('phase-lead-picker')).toBeInTheDocument();
    });

    it('hides the picker on leaf tasks even for owners', () => {
        render(
            <Harness>
                <TaskFormFields origin="instance" membershipRole="owner" taskType="task" projectId="p1" teamMembers={mockTeamMembers as TeamMemberWithProfile[]} />
            </Harness>,
        );
        expect(screen.queryByTestId('phase-lead-picker')).toBeNull();
    });

    it('hides the picker for non-owner roles (editor/coach/viewer/limited)', () => {
        for (const role of ['editor', 'coach', 'viewer', 'limited']) {
            const { unmount } = render(
                <Harness>
                    <TaskFormFields origin="instance" membershipRole={role} taskType="phase" projectId="p1" teamMembers={mockTeamMembers as TeamMemberWithProfile[]} />
                </Harness>,
            );
            expect(screen.queryByTestId('phase-lead-picker')).toBeNull();
            unmount();
        }
    });

    it('hides the picker on templates even for owners', () => {
        render(
            <Harness>
                <TaskFormFields origin="template" membershipRole="owner" taskType="phase" projectId="p1" teamMembers={mockTeamMembers as TeamMemberWithProfile[]} />
            </Harness>,
        );
        expect(screen.queryByTestId('phase-lead-picker')).toBeNull();
    });

    it('lists only viewer/limited members in the dropdown', () => {
        render(
            <Harness>
                <TaskFormFields origin="instance" membershipRole="owner" taskType="phase" projectId="p1" teamMembers={mockTeamMembers as TeamMemberWithProfile[]} />
            </Harness>,
        );
        fireEvent.click(screen.getByTestId('phase-lead-picker-trigger'));
        expect(screen.getByText('viewer1@test.local')).toBeInTheDocument();
        expect(screen.getByText('limited@test.local')).toBeInTheDocument();
        expect(screen.queryByText('editor@test.local')).toBeNull();
        expect(screen.queryByText('owner@test.local')).toBeNull();
    });

    it('hydrates the initial selection from form state and reflects toggles in the trigger label', () => {
        render(
            <Harness defaults={{ phase_lead_user_ids: ['u-viewer-1'] }}>
                <TaskFormFields origin="instance" membershipRole="owner" taskType="phase" projectId="p1" teamMembers={mockTeamMembers as TeamMemberWithProfile[]} />
            </Harness>,
        );
        // Initial label — the trigger reflects the hydrated default.
        const trigger = screen.getByTestId('phase-lead-picker-trigger');
        expect(trigger).toHaveTextContent('viewer1@test.local');

        fireEvent.click(trigger);
        // Find each member's checkbox via its label; Radix may render the popover
        // in a portal and thus duplicate DOM — use getAllByText and take the last
        // match which corresponds to the visible popover item.
        const limitedLabels = screen.getAllByText('limited@test.local');
        const limitedCheckbox = limitedLabels[limitedLabels.length - 1]
            .closest('label')!
            .querySelector('input[type="checkbox"]') as HTMLInputElement;
        const viewerLabels = screen.getAllByText('viewer1@test.local');
        const viewerCheckbox = viewerLabels[viewerLabels.length - 1]
            .closest('label')!
            .querySelector('input[type="checkbox"]') as HTMLInputElement;

        fireEvent.click(limitedCheckbox);
        expect(trigger).toHaveTextContent('viewer1@test.local');
        expect(trigger).toHaveTextContent('limited@test.local');

        fireEvent.click(viewerCheckbox);
        expect(trigger).not.toHaveTextContent('viewer1@test.local');
        expect(trigger).toHaveTextContent('limited@test.local');
    });
});
