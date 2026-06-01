import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listSkills, subscribeSkills } from '@/services/skillsService';
import type { Skill } from '@/types';

export function useSkills() {
  const qc = useQueryClient();
  const q = useQuery<Skill[]>({
    queryKey: ['skills'],
    queryFn: listSkills,
    staleTime: 60 * 60 * 1000,
  });
  useEffect(() => {
    const unsub = subscribeSkills((rows) => qc.setQueryData(['skills'], rows));
    return () => unsub();
  }, [qc]);
  return q;
}

/** Retorna só os nomes ativos. */
export function useActiveSkillNames(): string[] {
  const { data = [] } = useSkills();
  return data.filter((s) => s.active).map((s) => s.name);
}
