import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAllocations, subscribeAllocations } from '@/services/allocationsService';
import { useAuthStore } from '@/store/authStore';
import type { Allocation, Resource } from '@/types';

export function useAllocations() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const q = useQuery<Allocation[]>({
    queryKey: ['allocations'],
    queryFn: listAllocations,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsub = subscribeAllocations((rows) => qc.setQueryData(['allocations'], rows));
    return () => unsub();
  }, [qc]);

  // Para restringir por área: pega recursos do cache e filtra alocações pelos recursos da área.
  const filtered = useMemo(() => {
    const raw = q.data ?? [];
    if (isAdmin() || !user?.area) return raw;
    const resources = qc.getQueryData<Resource[]>(['resources']) ?? [];
    const allowedIds = new Set(
      resources.filter((r) => r.area === user.area).map((r) => r.id)
    );
    return raw.filter((a) => allowedIds.has(a.resourceId));
  }, [q.data, user?.area, isAdmin, qc]);

  return { ...q, data: filtered } as typeof q;
}
