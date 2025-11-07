import { render, screen, fireEvent } from '@testing-library/react';
import CreateNewTemplateForm from '../CreateNewTemplateForm';
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
        onClick={() => onPick && global.__TEMPLATE_FORM_LIBRARY_PICK__ && onPick(global.__TEMPLATE_FORM_LIBRARY_PICK__)}
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

describe('CreateNewTemplateForm master library integration', () => {
  const baseProps = {
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    backgroundColor: '#654321',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.__TEMPLATE_FORM_LIBRARY_PICK__ = null;
  });

  test('merges template data without overwriting edited fields', async () => {
    const libraryTask = {
      id: 'lib-2',
      title: 'Library Template',
      purpose: 'Library Purpose',
      description: 'Library Description',
      actions: ['Template Action'],
      resources: ['Template Resource'],
      default_duration: 7,
    };

    global.__TEMPLATE_FORM_LIBRARY_PICK__ = libraryTask;

    render(<CreateNewTemplateForm {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Show/i }));

    const purposeField = screen.getByLabelText('Purpose');
    fireEvent.change(purposeField, { target: { value: 'Custom Purpose' } });

    fireEvent.click(screen.getByTestId('mock-library-pick'));

    expect(screen.getByLabelText('Template Title *')).toHaveValue('Library Template');
    expect(screen.getByLabelText('Purpose')).toHaveValue('Custom Purpose');
    expect(screen.getByLabelText('Description')).toHaveValue('Library Description');

    const actionInputs = screen.getAllByPlaceholderText('Enter an action step');
    expect(actionInputs[0]).toHaveValue('Template Action');

    expect(screen.getByLabelText('Duration (days)')).toHaveValue(7);
    expect(screen.getByPlaceholderText('Enter a resource')).toHaveValue('Template Resource');
  });

  test('opens create resource modal from picker', async () => {
    global.__TEMPLATE_FORM_LIBRARY_PICK__ = null;

    render(<CreateNewTemplateForm {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Show/i }));

    fireEvent.click(screen.getByTestId('mock-create-resource'));
    expect(screen.getByText(/TODO: build create resource flow/i)).toBeInTheDocument();
  });
});
