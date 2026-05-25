import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Allocation } from '@/types';

const COL = 'allocations';

export function subscribeAllocations(cb: (rows: Allocation[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('startDate'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Allocation, 'id'>) }));
    cb(rows);
  });
}

export async function listAllocations(): Promise<Allocation[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('startDate')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Allocation, 'id'>) }));
}

export async function createAllocation(data: Omit<Allocation, 'id'>) {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAllocation(id: string, data: Partial<Allocation>) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteAllocation(id: string) {
  await deleteDoc(doc(db, COL, id));
}

export async function bulkCreateAllocations(items: Omit<Allocation, 'id'>[]) {
  const chunkSize = 400;
  let created = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((it) => {
      const ref = doc(collection(db, COL));
      batch.set(ref, { ...it, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    await batch.commit();
    created += chunk.length;
  }
  return created;
}
