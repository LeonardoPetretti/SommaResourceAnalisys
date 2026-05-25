import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, UserRole } from '@/types';

const COL = 'users';

export function subscribeUsers(cb: (users: AppUser[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('email'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, 'uid'>) }));
    cb(rows);
  });
}

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('email')));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, 'uid'>) }));
}

export async function updateUserRole(uid: string, role: UserRole) {
  await updateDoc(doc(db, COL, uid), { role, updatedAt: serverTimestamp() });
}

export async function updateUserActive(uid: string, active: boolean) {
  await updateDoc(doc(db, COL, uid), { active, updatedAt: serverTimestamp() });
}

export async function updateUserArea(uid: string, area: string) {
  await updateDoc(doc(db, COL, uid), { area, updatedAt: serverTimestamp() });
}
