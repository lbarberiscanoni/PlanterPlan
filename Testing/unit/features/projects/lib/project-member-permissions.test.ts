import { describe, expect, it } from 'vitest';
import { ROLES } from '@/shared/constants';
import { canManageProjectMembers } from '@/features/projects/lib/project-member-permissions';

describe('project member permissions', () => {
    it('limits member management to project owners and global admins', () => {
        expect(canManageProjectMembers(ROLES.OWNER)).toBe(true);
        expect(canManageProjectMembers(ROLES.ADMIN)).toBe(true);
        expect(canManageProjectMembers(ROLES.EDITOR)).toBe(false);
        expect(canManageProjectMembers(ROLES.COACH)).toBe(false);
        expect(canManageProjectMembers(ROLES.VIEWER)).toBe(false);
        expect(canManageProjectMembers(ROLES.LIMITED)).toBe(false);
        expect(canManageProjectMembers(null)).toBe(false);
    });
});
