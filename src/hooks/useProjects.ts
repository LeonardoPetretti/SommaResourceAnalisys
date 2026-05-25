import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listProjects, subscribeProjects } from '@/services/projectsService';
import { useAuthStore } from '@/store/authStore';
import type { Project } from '@/types';

export function useProjects() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const q = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsub = subscribeProjects((rows) => qc.setQueryData(['projects'], rows));
    return () => unsub();
  }, [qc]);

  const filtered = useMemo(() => {
    const raw = q.data ?? [];
    if (isAdmin() || !user?.area) return raw;
    return raw.filter((p) => p.area === user.area);
  }, [q.data, user?.area, isAdmin]);

  return { ...q, data: filtered } as typeof q;
}
