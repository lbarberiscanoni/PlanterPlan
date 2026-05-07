import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '@/shared/ui/CommandPalette';

beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPalette() {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <CommandPalette projects={[{ id: 'project-1', title: 'Project One' }]} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function openPalette() {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
}

describe('CommandPalette routes', () => {
  it.each([
    ['Tasks', '/tasks'],
    ['Settings', '/settings'],
    ['Team', '/team'],
    ['Project One', '/project/project-1'],
  ])('navigates %s to a real app route', async (label, path) => {
    renderPalette();

    openPalette();
    fireEvent.click(await screen.findByText(label));

    expect(screen.getByTestId('location')).toHaveTextContent(path);
  });

  it('does not expose stale launch routes or coming-soon actions', async () => {
    renderPalette();

    openPalette();

    expect(await screen.findByText('Tasks')).toBeInTheDocument();
    expect(screen.queryByText(/daily/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
