import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const AREA_COLLECTIONS = ['resources', 'projects', 'pipeline'] as const;
type AreaCollection = typeof AREA_COLLECTIONS[number];

export interface RenameAreaResult {
  total: number;
  perCollection: Record<AreaCollection, number>;
}

/**
 * Conta quantos documentos têm o campo `area` igual a `fromArea` em cada coleção.
 */
export async function countAreaOccurrences(
  fromArea: string
): Promise<RenameAreaResult> {
  const result: RenameAreaResult = {
    total: 0,
    perCollection: { resources: 0, projects: 0, pipeline: 0 },
  };
  for (const col of AREA_COLLECTIONS) {
    const snap = await getDocs(
      query(collection(db, col), where('area', '==', fromArea))
    );
    result.perCollection[col] = snap.size;
    result.total += snap.size;
  }
  return result;
}

/**
 * Renomeia o valor do campo `area` de `fromArea` para `toArea` em todos os
 * documentos de resources, projects e pipeline. Faz em batches de 400.
 */
export async function renameArea(
  fromArea: string,
  toArea: string
): Promise<RenameAreaResult> {
  if (!fromArea.trim() || !toArea.trim()) {
    throw new Error('Origem e destino são obrigatórios.');
  }
  if (fromArea.trim() === toArea.trim()) {
    throw new Error('Origem e destino devem ser diferentes.');
  }

  const result: RenameAreaResult = {
    total: 0,
    perCollection: { resources: 0, projects: 0, pipeline: 0 },
  };

  for (const col of AREA_COLLECTIONS) {
    const snap = await getDocs(
      query(collection(db, col), where('area', '==', fromArea))
    );
    if (snap.empty) continue;

    const chunkSize = 400;
    let count = 0;
    for (let i = 0; i < snap.docs.length; i += chunkSize) {
      const chunk = snap.docs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((d) => {
        batch.update(doc(db, col, d.id), {
          area: toArea,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      count += chunk.length;
    }

    result.perCollection[col] = count;
    result.total += count;
  }

  return result;
}

/**
 * Lista todas as áreas únicas encontradas nas coleções (resources + projects + pipeline).
 */
export async function listAllAreas(): Promise<string[]> {
  const set = new Set<string>();
  for (const col of AREA_COLLECTIONS) {
    const snap = await getDocs(collection(db, col));
    snap.docs.forEach((d) => {
      const a = (d.data() as any).area;
      if (a && typeof a === 'string') set.add(a);
    });
  }
  return Array.from(set).sort();
}
