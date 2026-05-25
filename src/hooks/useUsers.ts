import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listUsers, subscribeUsers } from '@/services/usersService';
import type { AppUser } from '@/types';

export function useUsers() {
  const qc = useQueryClient();
  const q = useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: listUsers,
    staleTime: 60 * 1000,
  });
  useEffect(() => {
    const unsub = subscribeUsers((rows) => qc.setQueryData(['users'], rows));
    return () => unsub();
  }, [qc]);
  return q;
}
