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
import type { Project } from '@/types';

const COL = 'projects';

export function subscribeProjects(cb: (rows: Project[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('name'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
    cb(rows);
  });
}

export async function listProjects(): Promise<Project[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
}

export async function createProject(data: Omit<Project, 'id'>) {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProject(id: string, data: Partial<Project>) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProject(id: string) {
  await deleteDoc(doc(db, COL, id));
}

export async function bulkCreateProjects(items: Omit<Project, 'id'>[]) {
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
