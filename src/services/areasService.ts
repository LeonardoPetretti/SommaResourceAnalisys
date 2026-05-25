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
import type { Area } from '@/types';

const COL = 'areas';

export function subscribeAreas(cb: (rows: Area[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('name'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Area, 'id'>),
    }));
    cb(rows);
  });
}

export async function listAreas(): Promise<Area[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')));
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Area, 'id'>),
  }));
}

export async function createArea(name: string, description = ''): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    name: name.trim(),
    description: description.trim(),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateArea(id: string, data: Partial<Area>) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteArea(id: string) {
  await deleteDoc(doc(db, COL, id));
}

/**
 * Importa áreas inferidas dos cadastros (resources/projects/pipeline) que ainda
 * não existem como documentos em /areas. Retorna a lista de nomes criados.
 */
export async function importExistingAreas(existingNames: string[]): Promise<string[]> {
  if (existingNames.length === 0) return [];

  // Pega as áreas atualmente em /areas (case-insensitive) para evitar duplicatas
  const current = await listAreas();
  const have = new Set(current.map((a) => a.name.trim().toLowerCase()));

  const created: string[] = [];
  for (const raw of existingNames) {
    const name = raw.trim();
    if (!name) continue;
    if (have.has(name.toLowerCase())) continue;
    try {
      await createArea(name, 'Importada dos cadastros existentes');
      created.push(name);
      have.add(name.toLowerCase());
    } catch {
      /* segue */
    }
  }
  return created;
}

/**
 * Remove documentos duplicados em /areas (mesmo nome case-insensitive).
 * Mantém o primeiro encontrado e remove os demais.
 * Retorna a quantidade removida e os nomes mantidos.
 */
export async function deduplicateAreas(): Promise<{ removed: number; kept: string[] }> {
  const all = await listAreas();
  // Agrupa por nome normalizado, mantendo o doc com createdAt mais antigo (ou o primeiro)
  const groups = new Map<string, Area[]>();
  for (const a of all) {
    const key = a.name.trim().toLowerCase();
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }

  let removed = 0;
  const kept: string[] = [];

  for (const arr of groups.values()) {
    // Ordena: ativos primeiro, depois por id (estabilidade)
    arr.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    const [keep, ...dupes] = arr;
    kept.push(keep.name);
    for (const d of dupes) {
      try {
        await deleteArea(d.id);
        removed++;
      } catch {
        /* segue */
      }
    }
  }

  return { removed, kept };
}

