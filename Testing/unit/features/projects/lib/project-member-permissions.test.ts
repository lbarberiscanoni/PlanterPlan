import { describe, expect, it } from 'vitest';
import { ROLES } from '@/shared/constants';
import { canManageProjectMembers } from '@/features/projects/lib/project-member-permissions';

describe('project member permissions', () => {
    it('limits member management to Planters and global admins', () => {
        expect(canManageProjectMembers(ROLES.PLANTER)).toBe(true);
        expect(canManageProjectMembers(ROLES.ADMIN)).toBe(true);
        expect(canManageProjectMembers(ROLES.TEAM)).toBe(false);
        expect(canManageProjectMembers('owner')).toBe(false);
        expect(canManageProjectMembers('editor')).toBe(false);
        expect(canManageProjectMembers(null)).toBe(false);
    });
});
