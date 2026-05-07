import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreateProjectModal from '@/features/projects/components/CreateProjectModal';

const dateState = vi.hoisted(() => ({
    now: '2026-06-01T12:00:00.000Z',
}));

vi.mock('@/shared/lib/date-engine', () => ({
    nowUtcIso: () => dateState.now,
    toIsoDate: (value: string | null | undefined) => value?.slice(0, 10) ?? null,
}));

vi.mock('@/shared/lib/use-dirty-close-guard', () => ({
    useDirtyCloseGuard: (_isDirty: boolean, onClose: () => void) => onClose,
}));

const launchTemplate = {
    id: 'template-launch',
    title: 'Launch Large',
    description: 'Seeded template',
    parent_task_id: null,
    settings: { seed_key: 'launch_large' },
};

describe('CreateProjectModal', () => {
    it('recomputes the default launch date each time the modal opens', () => {
        const onClose = vi.fn();
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        const { rerender } = render(
            <CreateProjectModal open onClose={onClose} onSubmit={onSubmit} />,
        );

        fireEvent.click(screen.getByRole('button', { name: /continue to details/i }));
        expect(screen.getByLabelText(/launch date/i)).toHaveValue('2026-06-01');

        rerender(<CreateProjectModal open={false} onClose={onClose} onSubmit={onSubmit} />);
        dateState.now = '2026-06-02T12:00:00.000Z';
        rerender(<CreateProjectModal open onClose={onClose} onSubmit={onSubmit} />);

        fireEvent.click(screen.getByRole('button', { name: /continue to details/i }));
        expect(screen.getByLabelText(/launch date/i)).toHaveValue('2026-06-02');
    });

    it('applies initial onboarding values and resolves seeded template choices', async () => {
        const onClose = vi.fn();
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <CreateProjectModal
                open
                onClose={onClose}
                onSubmit={onSubmit}
                templates={[launchTemplate]}
                initialStep={2}
                initialValues={{
                    title: 'Onboarding Church',
                    start_date: '2026-07-04',
                    templateSeedKey: 'launch_large',
                }}
            />,
        );

        expect(screen.getByLabelText(/project name/i)).toHaveValue('Onboarding Church');
        expect(screen.getByLabelText(/launch date/i)).toHaveValue('2026-07-04');

        fireEvent.click(screen.getByRole('button', { name: /create project/i }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Onboarding Church',
                start_date: '2026-07-04',
                templateId: 'template-launch',
            }));
        });
    });

    it('omits templateId when the default scaffold remains selected', async () => {
        const onClose = vi.fn();
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <CreateProjectModal
                open
                onClose={onClose}
                onSubmit={onSubmit}
                templates={[launchTemplate]}
            />,
        );

        const defaultCard = screen
            .getAllByTestId('template-card')
            .find((card) => card.getAttribute('data-template-id') === '__default__');
        expect(defaultCard).toBeDefined();
        fireEvent.click(defaultCard as HTMLElement);
        expect(defaultCard).toHaveAttribute('data-selected', 'true');

        fireEvent.click(screen.getByRole('button', { name: /continue to details/i }));
        fireEvent.change(screen.getByLabelText(/project name/i), {
            target: { value: 'Blank Scaffold Project' },
        });
        fireEvent.click(screen.getByRole('button', { name: /create project/i }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.not.objectContaining({
                templateId: expect.any(String),
            }));
        });
    });
});
