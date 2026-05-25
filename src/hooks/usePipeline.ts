import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listPipeline, subscribePipeline } from '@/services/pipelineService';
import { useAuthStore } from '@/store/authStore';
import type { PipelineProject } from '@/types';

export function usePipeline() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const q = useQuery<PipelineProject[]>({
    queryKey: ['pipeline'],
    queryFn: listPipeline,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    const unsub = subscribePipeline((rows) => qc.setQueryData(['pipeline'], rows));
    return () => unsub();
  }, [qc]);

  const filtered = useMemo(() => {
    const raw = q.data ?? [];
    if (isAdmin() || !user?.area) return raw;
    return raw.filter((p) => p.area === user.area);
  }, [q.data, user?.area, isAdmin]);

  return { ...q, data: filtered } as typeof q;
}
