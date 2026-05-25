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
import type { Resource } from '@/types';

const COL = 'resources';

export function subscribeResources(cb: (rows: Resource[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('name'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resource, 'id'>) }));
    cb(rows);
  });
}

export async function listResources(): Promise<Resource[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resource, 'id'>) }));
}

export async function createResource(data: Omit<Resource, 'id'>) {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateResource(id: string, data: Partial<Resource>) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteResource(id: string) {
  await deleteDoc(doc(db, COL, id));
}

export async function bulkCreateResources(items: Omit<Resource, 'id'>[]) {
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
