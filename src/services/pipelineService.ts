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
  where,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createProject } from '@/services/projectsService';
import type { PipelineProject, Project, ProjectStatus } from '@/types';

const COL = 'pipeline';

export function subscribePipeline(cb: (rows: PipelineProject[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('expectedCloseDate'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<PipelineProject, 'id'>),
    }));
    cb(rows);
  });
}

export async function listPipeline(): Promise<PipelineProject[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('expectedCloseDate')));
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PipelineProject, 'id'>),
  }));
}

export async function createPipelineProject(data: Omit<PipelineProject, 'id'>) {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePipelineProject(id: string, data: Partial<PipelineProject>) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deletePipelineProject(id: string) {
  await deleteDoc(doc(db, COL, id));
}

/**
 * Converte um pipeline com status "Ganho" em um Project real.
 * - Idempotente: se `convertedProjectId` já está setado, retorna o id existente.
 * - Reaproveita Project existente com mesmo nome (case-insensitive) se houver, para evitar duplicatas.
 *
 * Retorna o id do Project (criado ou existente).
 */
export async function convertPipelineToProject(p: PipelineProject): Promise<string> {
  if (p.convertedProjectId) return p.convertedProjectId;

  // Tenta achar Project com mesmo nome para evitar duplicatas
  let projectId: string | undefined;
  try {
    const q = query(
      collection(db, 'projects'),
      where('name', '==', p.name),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) projectId = snap.docs[0].id;
  } catch {
    /* sem permissão de read ou índice — segue criando */
  }

  if (!projectId) {
    const today = new Date().toISOString().slice(0, 10);
    const status: ProjectStatus =
      p.expectedStartDate > today ? 'Planejado' : 'Em Andamento';

    const payload: Omit<Project, 'id'> = {
      name: p.name,
      area: p.area,
      client: p.client ?? '',
      priority: p.priority,
      status,
      startDate: p.expectedStartDate,
      endDate: p.expectedEndDate,
    };
    projectId = await createProject(payload);
  }

  // Persiste o vínculo no pipeline
  await updateDoc(doc(db, COL, p.id), {
    convertedProjectId: projectId,
    updatedAt: serverTimestamp(),
  });

  return projectId;
}

export async function bulkCreatePipeline(items: Omit<PipelineProject, 'id'>[]) {
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
