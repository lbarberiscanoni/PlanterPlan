import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function DndSmokeSurface() {
  useDraggable({ id: 'compat-drag' });
  useDroppable({ id: 'compat-drop' });

  return (
    <div data-testid="dnd-drop">
      <button type="button">Drag handle</button>
    </div>
  );
}

describe('dnd-kit compatibility smoke', () => {
  it('renders draggable and droppable hooks under React 18 without invalid hook calls', () => {
    render(
      <DndContext>
        <DndSmokeSurface />
      </DndContext>,
    );

    expect(screen.getByTestId('dnd-drop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag handle' })).toBeInTheDocument();
  });
});
