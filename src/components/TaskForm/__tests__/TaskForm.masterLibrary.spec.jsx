import { render, screen, fireEvent } from '@testing-library/react';
import TaskForm from '../TaskForm';
import { fetchMasterLibraryTasks, searchMasterLibraryTasks } from '../../../services/taskService';

jest.mock('../../../services/taskService', () => ({
  fetchMasterLibraryTasks: jest.fn(),
  searchMasterLibraryTasks: jest.fn(),
}));

jest.mock('../../library/MasterLibraryPicker', () => {
  const React = require('react');
  return ({ onPick, onCreateNew }) => (
    <div>
      <button
        type="button"
        data-testid="mock-library-pick"
        onClick={() => onPick && global.__TASK_FORM_LIBRARY_PICK__ && onPick(global.__TASK_FORM_LIBRARY_PICK__)}
      >
        Mock Pick
      </button>
      {onCreateNew && (
        <button
          type="button"
          data-testid="mock-create-resource"
          onClick={onCreateNew}
        >
          Mock Create Resource
        </button>
      )}
    </div>
  );
});

describe('TaskForm master library integration', () => {
  const baseProps = {
    parentTaskId: null,
    parentStartDate: null,
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    backgroundColor: '#123456',
    originType: 'instance',
    initialData: null,
    isEditing: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.__TASK_FORM_LIBRARY_PICK__ = null;
  });

  test('selecting a library item populates blank fields without overwriting edits', async () => {
    const libraryTask = {
      id: 'lib-1',
      title: 'Library Task Title',
      purpose: 'Library Purpose',
      description: 'Library Description',
      actions: ['Library Action'],
      resources: ['Library Resource'],
      default_duration: 5,
    };

    global.__TASK_FORM_LIBRARY_PICK__ = libraryTask;

    render(<TaskForm {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Copy from Library/i }));

    const titleInput = screen.getByLabelText('Title *');
    fireEvent.change(titleInput, { target: { value: 'Custom Title' } });

    fireEvent.click(screen.getByTestId('mock-library-pick'));

    expect(screen.getByLabelText('Title *')).toHaveValue('Custom Title');
    expect(screen.getByLabelText('Purpose')).toHaveValue('Library Purpose');
    expect(screen.getByLabelText('Description')).toHaveValue('Library Description');

    const actionInputs = screen.getAllByPlaceholderText('Enter an action step');
    expect(actionInputs[0]).toHaveValue('Library Action');

    expect(screen.getByLabelText('Duration (days)')).toHaveValue(5);

    expect(screen.getByText('Library Resource')).toBeInTheDocument();
  });

  test('shows create resource modal when triggered from picker', async () => {
    global.__TASK_FORM_LIBRARY_PICK__ = null;

    render(<TaskForm {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Copy from Library/i }));

    fireEvent.click(screen.getByTestId('mock-create-resource'));
    expect(screen.getByText(/TODO: build create resource flow/i)).toBeInTheDocument();
  });
});
