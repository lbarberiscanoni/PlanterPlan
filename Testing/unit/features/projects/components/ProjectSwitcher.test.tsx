import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
let projects: Array<{ id: string; title: string; origin: string; status: string | null; is_complete: boolean }> = [];
let projectsLoading = false;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ projectId: undefined }),
  };
});

import ProjectSwitcher from '@/features/projects/components/ProjectSwitcher';

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <ProjectSwitcher projects={projects} projectsLoading={projectsLoading} />
    </MemoryRouter>,
  );
}

// Radix DropdownMenu opens on pointer events, not on synthetic `click`.
// Open it via Enter on the trigger, which Radix supports for keyboard users
// and which works reliably under jsdom.
async function openMenu() {
  const trigger = screen.getByTestId('project-switcher-trigger');
  await act(async () => {
    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  projects = [];
  projectsLoading = false;
});

describe('ProjectSwitcher', () => {
  it('renders only active projects in the dropdown by default', async () => {
    projects = [
        { id: 'p1', title: 'Active One', origin: 'instance', status: 'in_progress', is_complete: false },
        { id: 'p2', title: 'Archived One', origin: 'instance', status: 'archived', is_complete: false },
        { id: 'p3', title: 'Active Two', origin: 'instance', status: 'planning', is_complete: false },
        { id: 't1', title: 'Template', origin: 'template', status: null, is_complete: false },
      ];

    renderSwitcher();
    await openMenu();

    expect(screen.getByTestId('project-switcher-item-p1')).toBeInTheDocument();
    expect(screen.getByTestId('project-switcher-item-p3')).toBeInTheDocument();
    expect(screen.queryByTestId('project-switcher-item-p2')).toBeNull();
    expect(screen.queryByTestId('project-switcher-archived-list')).toBeNull();
  });

  it('reveals archived projects when "Show archived" is toggled', async () => {
    projects = [
        { id: 'p1', title: 'Active One', origin: 'instance', status: 'in_progress', is_complete: false },
        { id: 'p2', title: 'Archived One', origin: 'instance', status: 'archived', is_complete: false },
      ];

    renderSwitcher();
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-toggle-archived'));
    });

    expect(screen.getByTestId('project-switcher-archived-list')).toBeInTheDocument();
    expect(screen.getByTestId('project-switcher-archived-p2')).toBeInTheDocument();
  });

  it('navigates to /project/:id when an item is selected', async () => {
    projects = [
        { id: 'p1', title: 'Active One', origin: 'instance', status: 'in_progress', is_complete: false },
      ];

    renderSwitcher();
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-item-p1'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/project/p1');
  });

  it('excludes completed projects from the active list', async () => {
    projects = [
        { id: 'p1', title: 'Done', origin: 'instance', status: 'completed', is_complete: true },
        { id: 'p2', title: 'Live', origin: 'instance', status: 'in_progress', is_complete: false },
      ];

    renderSwitcher();
    await openMenu();

    expect(screen.queryByTestId('project-switcher-item-p1')).toBeNull();
    expect(screen.getByTestId('project-switcher-item-p2')).toBeInTheDocument();
  });

  // Wave 25: "Show completed" toggle ------------------------------------

  it('hides completed projects by default; the "Show completed" toggle reveals them', async () => {
    projects = [
        { id: 'p1', title: 'Live', origin: 'instance', status: 'in_progress', is_complete: false },
        { id: 'p2', title: 'Done', origin: 'instance', status: 'completed', is_complete: true },
      ];

    renderSwitcher();
    await openMenu();

    // Not visible by default.
    expect(screen.queryByTestId('project-switcher-completed-list')).toBeNull();
    expect(screen.queryByTestId('project-switcher-completed-p2')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-toggle-completed'));
    });

    expect(screen.getByTestId('project-switcher-completed-list')).toBeInTheDocument();
    expect(screen.getByTestId('project-switcher-completed-p2')).toBeInTheDocument();
  });

  it('"Show completed" does NOT reveal archived projects (toggles are independent)', async () => {
    projects = [
        { id: 'p1', title: 'Done', origin: 'instance', status: 'completed', is_complete: true },
        { id: 'p2', title: 'Archived', origin: 'instance', status: 'archived', is_complete: false },
      ];

    renderSwitcher();
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-toggle-completed'));
    });

    expect(screen.getByTestId('project-switcher-completed-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('project-switcher-archived-p2')).toBeNull();
    expect(screen.queryByTestId('project-switcher-archived-list')).toBeNull();
  });

  it('a project that is both archived AND completed appears only when BOTH toggles are on', async () => {
    // In this repo isArchived = (status === archived). Such a row is
    // classified as archived and NOT as completed by the component's filters
    // (completed requires NOT archived). So it shows up in the archived list
    // with "Show archived" on, not in the completed list.
    projects = [
        {
          id: 'p1',
          title: 'Archived & Complete',
          origin: 'instance',
          status: 'archived',
          is_complete: true,
        },
      ];

    renderSwitcher();
    await openMenu();

    // With neither toggle on, nothing.
    expect(screen.queryByTestId('project-switcher-archived-p1')).toBeNull();
    expect(screen.queryByTestId('project-switcher-completed-p1')).toBeNull();

    // With only "Show completed": still not shown (the row is archived).
    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-toggle-completed'));
    });
    expect(screen.queryByTestId('project-switcher-completed-p1')).toBeNull();
    expect(screen.queryByTestId('project-switcher-archived-p1')).toBeNull();

    // Flip "Show archived" on as well → appears in the archived list.
    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-toggle-archived'));
    });
    expect(screen.getByTestId('project-switcher-archived-p1')).toBeInTheDocument();
  });

  it('navigates to /project/:id when a completed entry is selected', async () => {
    projects = [
        { id: 'p1', title: 'Done', origin: 'instance', status: 'completed', is_complete: true },
      ];

    renderSwitcher();
    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-toggle-completed'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('project-switcher-completed-p1'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/project/p1');
  });
});
