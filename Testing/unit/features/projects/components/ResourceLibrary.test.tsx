import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@test/render-with-providers';
import type { ResourceWithTask } from '@/shared/db/app.types';

const mocks = vi.hoisted(() => ({
    useProjectResources: vi.fn(),
}));

vi.mock('@/features/projects/hooks/useProjectResources', () => ({
    useProjectResources: mocks.useProjectResources,
}));

import ResourceLibrary from '@/features/projects/components/ResourceLibrary';

function makeResource(overrides: Partial<ResourceWithTask> = {}): ResourceWithTask {
    return {
        id: 'resource-1',
        task_id: 'task-1',
        resource_type: 'url',
        resource_url: 'https://example.com',
        resource_text: null,
        storage_bucket: null,
        storage_path: null,
        created_at: '2026-05-07T00:00:00.000Z',
        updated_at: '2026-05-07T00:00:00.000Z',
        task: { id: 'task-1', title: 'Alpha Task', root_id: 'project-1' },
        ...overrides,
    };
}

describe('ResourceLibrary localization', () => {
    beforeEach(() => {
        mocks.useProjectResources.mockReset();
    });

    it('renders project resources from the active locale catalog', async () => {
        mocks.useProjectResources.mockReturnValue({
            data: [makeResource()],
            isLoading: false,
        });
        await i18n.changeLanguage('es');

        renderWithProviders(<ResourceLibrary projectId="project-1" />);

        expect(screen.getByPlaceholderText('Buscar recursos…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enlaces' })).toBeInTheDocument();
        expect(screen.getByText('Enlace externo')).toBeInTheDocument();
        expect(screen.getByText('De: Alpha Task')).toBeInTheDocument();
        expect(screen.getByText('1 recurso total')).toBeInTheDocument();
    });

    it('uses localized empty-search copy', async () => {
        mocks.useProjectResources.mockReturnValue({
            data: [makeResource({ resource_text: 'Implementation note', resource_type: 'text', resource_url: null })],
            isLoading: false,
        });
        await i18n.changeLanguage('es');

        renderWithProviders(<ResourceLibrary projectId="project-1" />);

        await screen.findByText('Nota');
        fireEvent.change(screen.getByPlaceholderText('Buscar recursos…'), {
            target: { value: 'missing' },
        });

        expect(screen.getByText('Ningún recurso coincide con tu búsqueda')).toBeInTheDocument();
        expect(screen.getByText('Prueba a ajustar tu búsqueda o filtro.')).toBeInTheDocument();
    });
});
