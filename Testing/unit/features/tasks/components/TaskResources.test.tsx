import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@test/render-with-providers';
import type { TaskResourceRow } from '@/shared/db/app.types';

const mocks = vi.hoisted(() => ({
    filter: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    setPrimary: vi.fn(),
}));

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            TaskResource: {
                filter: mocks.filter,
                create: mocks.create,
                delete: mocks.delete,
                setPrimary: mocks.setPrimary,
            },
        },
    },
}));

import TaskResources from '@/features/tasks/components/TaskResources';

function makeResource(overrides: Partial<TaskResourceRow> = {}): TaskResourceRow {
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
        ...overrides,
    };
}

describe('TaskResources localization', () => {
    beforeEach(() => {
        mocks.filter.mockReset();
        mocks.create.mockReset();
        mocks.delete.mockReset();
        mocks.setPrimary.mockReset();
    });

    it('renders empty state and add-resource modal from the active locale catalog', async () => {
        const user = userEvent.setup();
        mocks.filter.mockResolvedValue([]);
        await i18n.changeLanguage('es');

        renderWithProviders(<TaskResources taskId="task-1" />);

        expect(await screen.findByText('Aún no hay recursos')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Agregar recurso' }));

        expect(screen.getByRole('dialog', { name: 'Agregar recurso' })).toBeInTheDocument();
        expect(screen.getByText('Adjunta un enlace, una nota o una referencia de documento a esta tarea.')).toBeInTheDocument();
        expect(screen.getByText('Tipo de recurso')).toBeInTheDocument();
        expect(screen.getAllByText('Enlace externo').length).toBeGreaterThan(0);
        expect(screen.getByText('URL')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });

    it('localizes resource labels and row action accessible names', async () => {
        mocks.filter.mockResolvedValue([makeResource()]);
        await i18n.changeLanguage('es');

        renderWithProviders(<TaskResources taskId="task-1" primaryResourceId="resource-1" />);

        expect(await screen.findByText('Enlace externo')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Quitar Enlace externo como recurso principal' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Eliminar recurso Enlace externo' })).toBeInTheDocument();
    });
});
