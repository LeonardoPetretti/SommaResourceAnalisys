import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();

/**
 * Exclusão em lote performática - admin only.
 * Cliente também pode fazer via batch, mas esta função
 * pode lidar com volumes maiores sem timeout.
 */
export const bulkDelete = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Login necessário');

  const userSnap = await db.collection('users').doc(auth.uid).get();
  const user = userSnap.data();
  if (!user || user.role !== 'admin' || user.active !== true) {
    throw new HttpsError('permission-denied', 'Apenas admins');
  }

  const collection = request.data?.collection as string;
  const allowed = ['resources', 'projects', 'allocations'];
  if (!allowed.includes(collection)) {
    throw new HttpsError('invalid-argument', 'Coleção inválida');
  }

  let deleted = 0;
  const batchSize = 400;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collection(collection).limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < batchSize) break;
  }

  await db.collection('logs').add({
    action: 'bulk_delete',
    collection,
    deleted,
    userId: auth.uid,
    userEmail: user.email,
    timestamp: FieldValue.serverTimestamp(),
  });

  return { deleted };
});

/**
 * Promover usuário (admin only).
 */
export const setUserRole = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Login necessário');

  const adminSnap = await db.collection('users').doc(auth.uid).get();
  const admin = adminSnap.data();
  if (!admin || admin.role !== 'admin' || admin.active !== true) {
    throw new HttpsError('permission-denied', 'Apenas admins');
  }

  const { uid, role, active } = request.data ?? {};
  if (!uid || !['admin', 'manager', 'viewer'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Parâmetros inválidos');
  }

  await db.collection('users').doc(uid).update({
    role,
    active: active ?? true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
