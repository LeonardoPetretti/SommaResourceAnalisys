import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, googleProvider, BOOTSTRAP_ADMIN_EMAIL } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { log, auditLog } from '@/lib/logger';
import type { AppUser, UserRole } from '@/types';

let userDocUnsub: (() => void) | null = null;

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(result.user);
  await auditLog('login', { userId: result.user.uid, userEmail: result.user.email });
  return result.user;
}

export async function logoutUser() {
  await auditLog('logout', { userId: auth.currentUser?.uid, userEmail: auth.currentUser?.email });
  await signOut(auth);
}

async function ensureUserDoc(fbUser: FirebaseUser) {
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const isBootstrap =
      BOOTSTRAP_ADMIN_EMAIL &&
      fbUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const role: UserRole = isBootstrap ? 'admin' : 'viewer';

    await setDoc(ref, {
      email: fbUser.email,
      name: fbUser.displayName ?? fbUser.email ?? 'Usuário',
      photoURL: fbUser.photoURL ?? null,
      role,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
    log.info('Novo usuário criado', { uid: fbUser.uid, role });
  } else {
    // Atualiza só lastLogin (sem alterar role/active para passar nas regras)
    await setDoc(
      ref,
      {
        lastLogin: serverTimestamp(),
        photoURL: fbUser.photoURL ?? snap.data()?.photoURL ?? null,
        name: fbUser.displayName ?? snap.data()?.name,
      },
      { merge: true }
    ).catch(() => {});
  }
}

export function initAuthListener() {
  const store = useAuthStore.getState();
  onAuthStateChanged(auth, async (fbUser) => {
    if (userDocUnsub) {
      userDocUnsub();
      userDocUnsub = null;
    }

    if (!fbUser) {
      store.setUser(null);
      store.setLoading(false);
      store.setInitialized(true);
      return;
    }

    try {
      await ensureUserDoc(fbUser);
    } catch (e) {
      log.error('Falha em ensureUserDoc', { err: String(e) });
    }

    // Listener em tempo real do doc do usuário (role/active podem mudar)
    const ref = doc(db, 'users', fbUser.uid);
    userDocUnsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (!data) {
          store.setUser(null);
        } else {
          const appUser: AppUser = {
            uid: fbUser.uid,
            email: data.email,
            name: data.name,
            photoURL: data.photoURL,
            role: data.role,
            active: data.active,
            area: data.area ?? '',
            lastLogin: data.lastLogin ?? null,
          };
          store.setUser(appUser);
        }
        store.setLoading(false);
        store.setInitialized(true);
      },
      (err) => {
        log.error('userDoc snapshot error', { err: String(err) });
        store.setLoading(false);
        store.setInitialized(true);
      }
    );
  });
}
