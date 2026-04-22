import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { AdminAnalyticsSnapshot } from '@/shared/db/app.types';

/**
 * Wave 34 Task 3: aggregated analytics snapshot in a single round-trip.
 * 5-minute staleTime because the snapshot is expensive to recompute and
 * dashboard freshness beyond that cadence isn't meaningful for admins.
 */
export function useAdminAnalytics(): UseQueryResult<AdminAnalyticsSnapshot | null, Error> {
    return useQuery<AdminAnalyticsSnapshot | null, Error>({
        queryKey: ['adminAnalytics'],
        queryFn: () => planter.admin.analyticsSnapshot(),
        staleTime: 5 * 60 * 1000,
    });
}
