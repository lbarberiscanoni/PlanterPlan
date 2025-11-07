import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MasterLibraryPicker from '../MasterLibraryPicker';
import { fetchMasterLibraryTasks, searchMasterLibraryTasks } from '../../../services/taskService';

jest.mock('../../../services/taskService', () => ({
  fetchMasterLibraryTasks: jest.fn(),
  searchMasterLibraryTasks: jest.fn(),
}));

describe('MasterLibraryPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('renders loading state and displays results', async () => {
    let resolveInitial;
    fetchMasterLibraryTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
    );

    render(<MasterLibraryPicker onPick={jest.fn()} />);

    expect(screen.getByText(/Searching/i)).toBeInTheDocument();

    await act(async () => {
      resolveInitial?.([
        { id: '1', title: 'Task One', description: 'Example task' },
      ]);
    });

    expect(await screen.findByText('Task One')).toBeInTheDocument();
  });

  test('debounces search requests', async () => {
    jest.useFakeTimers();
    let resolveInitial;
    let resolveSearch;

    fetchMasterLibraryTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
    );

    searchMasterLibraryTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );

    render(<MasterLibraryPicker onPick={jest.fn()} />);

    await act(async () => {
      resolveInitial?.([]);
    });

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'pla' } });
    fireEvent.change(input, { target: { value: 'plant' } });
    fireEvent.change(input, { target: { value: 'planter' } });

    expect(searchMasterLibraryTasks).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      resolveSearch?.({ data: [], error: null, totalCount: 0 });
    });

    await waitFor(() => {
      expect(searchMasterLibraryTasks).toHaveBeenCalledTimes(1);
    });

    expect(searchMasterLibraryTasks).toHaveBeenCalledWith('planter', null, expect.any(Object));

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('supports keyboard navigation and selection', async () => {
    let resolveInitial;
    const mockTasks = [
      { id: '1', title: 'Alpha Task' },
      { id: '2', title: 'Beta Task' },
    ];

    fetchMasterLibraryTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
    );
    const handlePick = jest.fn();

    render(<MasterLibraryPicker onPick={handlePick} />);

    await act(async () => {
      resolveInitial?.(mockTasks);
    });

    const input = await screen.findByRole('combobox');
    const options = await screen.findAllByTestId('library-option');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handlePick).toHaveBeenCalledWith(mockTasks[1]);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    });
  });

  test('exposes combobox accessibility attributes', async () => {
    let resolveInitial;
    fetchMasterLibraryTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
    );

    render(<MasterLibraryPicker onPick={jest.fn()} />);

    await act(async () => {
      resolveInitial?.([{ id: '1', title: 'Task One' }]);
    });

    const input = await screen.findByRole('combobox');
    const options = await screen.findAllByTestId('library-option');
    expect(input).toHaveAttribute('aria-controls');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    const listboxId = input.getAttribute('aria-controls');
    expect(screen.getByRole('listbox')).toHaveAttribute('id', listboxId);
    expect(options).toHaveLength(1);
  });

  test('shows create resource affordance when search has no matches', async () => {
    jest.useFakeTimers();
    let resolveInitial;
    let resolveSearch;
    fetchMasterLibraryTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
    );
    searchMasterLibraryTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );
    const handleCreate = jest.fn();

    render(<MasterLibraryPicker onPick={jest.fn()} onCreateNew={handleCreate} />);

    await act(async () => {
      resolveInitial?.([]);
    });

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'missing task' } });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      resolveSearch?.({ data: [], error: null, totalCount: 0 });
    });

    await screen.findByText(/No results found/i);
    const createButton = await screen.findByRole('button', { name: /Create new resource/i });

    fireEvent.click(createButton);
    expect(handleCreate).toHaveBeenCalledTimes(1);

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
});
