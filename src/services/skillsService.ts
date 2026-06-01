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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Skill } from '@/types';

const COL = 'skills';

export function subscribeSkills(cb: (rows: Skill[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('name'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Skill, 'id'>),
    }));
    cb(rows);
  });
}

export async function listSkills(): Promise<Skill[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')));
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Skill, 'id'>),
  }));
}

export async function createSkill(
  name: string,
  category = '',
  description = ''
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    name: name.trim(),
    category: category.trim(),
    description: description.trim(),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSkill(id: string, data: Partial<Skill>) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteSkill(id: string) {
  await deleteDoc(doc(db, COL, id));
}

/**
 * Importa skills inferidas dos recursos existentes (resource.skills) que ainda
 * não estão cadastradas em /skills. Retorna os nomes criados.
 */
export async function importExistingSkills(existingNames: string[]): Promise<string[]> {
  if (existingNames.length === 0) return [];
  const current = await listSkills();
  const have = new Set(current.map((s) => s.name.trim().toLowerCase()));
  const created: string[] = [];
  for (const raw of existingNames) {
    const name = raw.trim();
    if (!name) continue;
    if (have.has(name.toLowerCase())) continue;
    try {
      await createSkill(name, '', 'Importada dos recursos existentes');
      created.push(name);
      have.add(name.toLowerCase());
    } catch {
      /* segue */
    }
  }
  return created;
}

/** Remove documentos duplicados em /skills (case-insensitive). */
export async function deduplicateSkills(): Promise<{ removed: number; kept: string[] }> {
  const all = await listSkills();
  const groups = new Map<string, Skill[]>();
  for (const s of all) {
    const key = s.name.trim().toLowerCase();
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  let removed = 0;
  const kept: string[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    const [keep, ...dupes] = arr;
    kept.push(keep.name);
    for (const d of dupes) {
      try {
        await deleteSkill(d.id);
        removed++;
      } catch {
        /* segue */
      }
    }
  }
  return { removed, kept };
}
