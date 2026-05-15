import { ROLES } from '@/shared/constants';

interface RoleIndicatorProps {
 role?: string;
}

const roleColors: Record<string, string> = {
 [ROLES.ADMIN]: 'bg-purple-50 text-purple-700 border-purple-200',
 [ROLES.PLANTER]: 'bg-brand-50 text-brand-700 border-brand-200',
 [ROLES.TEAM]: 'bg-sky-50 text-sky-700 border-sky-200',
 default: 'bg-slate-50 text-slate-700 border-slate-200',
};

const RoleIndicator = ({ role }: RoleIndicatorProps) => {
 const normalizedRole = role ? role.toLowerCase() : ROLES.TEAM;
 const colorClass = roleColors[normalizedRole] || roleColors.default;
 const label = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);
 return (
 <span
 className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border capitalize ${colorClass}`}
 aria-label={`Role: ${label}`}
 >
 {label}
 </span>
 );
};

export default RoleIndicator;
