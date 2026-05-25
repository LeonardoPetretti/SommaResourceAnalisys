import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAreas, subscribeAreas } from '@/services/areasService';
import type { Area } from '@/types';

export function useAreas() {
  const qc = useQueryClient();
  const q = useQuery<Area[]>({
    queryKey: ['areas'],
    queryFn: listAreas,
    staleTime: 60 * 60 * 1000, // raramente muda
  });
  useEffect(() => {
    const unsub = subscribeAreas((rows) => qc.setQueryData(['areas'], rows));
    return () => unsub();
  }, [qc]);
  return q;
}

/** Retorna só as áreas ativas, com nomes. */
export function useActiveAreaNames(): string[] {
  const { data = [] } = useAreas();
  return data.filter((a) => a.active).map((a) => a.name);
}
