import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ----
const mockGetWithStats = vi.fn();
const mockTaskFilter = vi.fn();
const mockListTeamMembersWithProfiles = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Project: { getWithStats: (...args: unknown[]) => mockGetWithStats(...args) },
      Task: { filter: (...args: unknown[]) => mockTaskFilter(...args) },
      TeamMember: { listByProjectWithProfiles: (...args: unknown[]) => mockListTeamMembersWithProfiles(...args) },
    },
  },
}));

import { useProjectData } from '@/features/projects/hooks/useProjectData';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useProjectData', () => {
  const projectId = 'proj-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWithStats.mockResolvedValue({ data: { id: projectId, title: 'Test Project' } });
    mockTaskFilter.mockResolvedValue([]);
    mockListTeamMembersWithProfiles.mockResolvedValue([]);
  });

  describe('disabled states', () => {
    it('does not fetch when projectId is null', () => {
      const { result } = renderHook(() => useProjectData(null), { wrapper: createWrapper() });

      expect(result.current.project).toBeUndefined();
      expect(mockGetWithStats).not.toHaveBeenCalled();
      expect(mockTaskFilter).not.toHaveBeenCalled();
      expect(mockListTeamMembersWithProfiles).not.toHaveBeenCalled();
    });

    it('does not fetch when projectId is undefined', () => {
      const { result } = renderHook(() => useProjectData(undefined), { wrapper: createWrapper() });

      expect(result.current.project).toBeUndefined();
      expect(mockGetWithStats).not.toHaveBeenCalled();
    });
  });

  describe('data fetching', () => {
    it('fetches project metadata with getWithStats', async () => {
      renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockGetWithStats).toHaveBeenCalledWith(projectId);
      });
    });

    it('loadingProject is true initially', () => {
      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      expect(result.current.loadingProject).toBe(true);
    });

    it('extracts project from nested data.data', async () => {
      mockGetWithStats.mockResolvedValue({ data: { id: projectId, title: 'My Project', status: 'in_progress' } });

      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.project).toBeDefined();
      });

      expect(result.current.project.id).toBe(projectId);
      expect(result.current.project.title).toBe('My Project');
    });

    it('fetches team members by project_id', async () => {
      const members = [{ id: 'm1', project_id: projectId, user_id: 'u1', role: 'editor' }];
      mockListTeamMembersWithProfiles.mockResolvedValue(members);

      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.teamMembers).toEqual(members);
      });

      expect(mockListTeamMembersWithProfiles).toHaveBeenCalledWith(projectId);
    });

    it('defaults teamMembers to empty array', async () => {
      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      // Before query resolves, should be empty array (default)
      expect(result.current.teamMembers).toEqual([]);
    });
  });

  describe('hierarchy categorization', () => {
    it('identifies phases as direct children of projectId', async () => {
      const hierarchy = [
        { id: 'phase-1', parent_task_id: projectId, root_id: projectId },
        { id: 'phase-2', parent_task_id: projectId, root_id: projectId },
        { id: 'milestone-1', parent_task_id: 'phase-1', root_id: projectId },
      ];
      mockTaskFilter.mockResolvedValue(hierarchy);

      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.phases.length).toBe(2);
      });

      expect(result.current.phases.map(p => p.id)).toEqual(['phase-1', 'phase-2']);
    });

    it('identifies milestones as children of phases', async () => {
      const hierarchy = [
        { id: 'phase-1', parent_task_id: projectId, root_id: projectId },
        { id: 'ms-1', parent_task_id: 'phase-1', root_id: projectId },
        { id: 'ms-2', parent_task_id: 'phase-1', root_id: projectId },
      ];
      mockTaskFilter.mockResolvedValue(hierarchy);

      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.milestones.length).toBe(2);
      });

      expect(result.current.milestones.map(m => m.id)).toEqual(['ms-1', 'ms-2']);
    });

    it('categorizes remaining tasks as tasks', async () => {
      const hierarchy = [
        { id: 'phase-1', parent_task_id: projectId, root_id: projectId },
        { id: 'ms-1', parent_task_id: 'phase-1', root_id: projectId },
        { id: 'task-1', parent_task_id: 'ms-1', root_id: projectId },
        { id: 'task-2', parent_task_id: 'ms-1', root_id: projectId },
      ];
      mockTaskFilter.mockResolvedValue(hierarchy);

      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.tasks.length).toBe(2);
      });

      expect(result.current.tasks.map(t => t.id)).toEqual(['task-1', 'task-2']);
    });

    it('returns empty arrays for empty hierarchy', async () => {
      mockTaskFilter.mockResolvedValue([]);

      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockTaskFilter).toHaveBeenCalled();
      });

      expect(result.current.phases).toEqual([]);
      expect(result.current.milestones).toEqual([]);
      expect(result.current.tasks).toEqual([]);
    });

    it('handles complex hierarchy with multiple phases and nested tasks', async () => {
      const hierarchy = [
        { id: 'p1', parent_task_id: projectId, root_id: projectId },
        { id: 'p2', parent_task_id: projectId, root_id: projectId },
        { id: 'ms1', parent_task_id: 'p1', root_id: projectId },
        { id: 'ms2', parent_task_id: 'p2', root_id: projectId },
        { id: 't1', parent_task_id: 'ms1', root_id: projectId },
        { id: 't2', parent_task_id: 'ms2', root_id: projectId },
        { id: 't3', parent_task_id: 't1', root_id: projectId },
      ];
      mockTaskFilter.mockResolvedValue(hierarchy);

      const { result } = renderHook(() => useProjectData(projectId), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.phases.length).toBe(2);
      });

      expect(result.current.milestones.length).toBe(2);
      expect(result.current.tasks.length).toBe(3); // t1, t2, t3
    });
  });
});
