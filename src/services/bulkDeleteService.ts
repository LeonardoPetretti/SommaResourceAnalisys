import { collection, getDocs, limit, query, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ProgressCb = (info: { collection: string; deleted: number; total?: number }) => void;

/**
 * Apaga toda uma coleção em lotes de 400.
 * Continua até a coleção estar vazia. Retorna o total apagado.
 */
export async function bulkDeleteCollection(col: string, onProgress?: ProgressCb): Promise<number> {
  let totalDeleted = 0;
  const batchSize = 400;
  // Cada loop apaga até 400 e checa se ainda existem mais.
  // O loop não trava a UI porque cada iteração é assíncrona.
  while (true) {
    const snap = await getDocs(query(collection(db, col), limit(batchSize)));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(doc(db, col, d.id)));
    await batch.commit();
    totalDeleted += snap.size;
    onProgress?.({ collection: col, deleted: totalDeleted });
    if (snap.size < batchSize) break;
  }
  return totalDeleted;
}
