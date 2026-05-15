import { ROLES } from '@/shared/constants';

export function canManageProjectMembers(role: string | null | undefined): boolean {
    const normalizedRole = role?.toLowerCase();
    return normalizedRole === ROLES.PLANTER || normalizedRole === ROLES.ADMIN;
}
