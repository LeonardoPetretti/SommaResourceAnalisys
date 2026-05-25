import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listResources, subscribeResources } from '@/services/resourcesService';
import { useAuthStore } from '@/store/authStore';
import type { Resource } from '@/types';

export function useResources() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const q = useQuery<Resource[]>({
    queryKey: ['resources'],
    queryFn: listResources,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsub = subscribeResources((rows) => {
      qc.setQueryData(['resources'], rows);
    });
    return () => unsub();
  }, [qc]);

  // Restrição por área: admin vê tudo; outros só veem a área associada (se houver).
  const filtered = useMemo(() => {
    const raw = q.data ?? [];
    if (isAdmin() || !user?.area) return raw;
    return raw.filter((r) => r.area === user.area);
  }, [q.data, user?.area, isAdmin]);

  return { ...q, data: filtered } as typeof q;
}
