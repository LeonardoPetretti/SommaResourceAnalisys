/**
 * Logger estruturado: console em dev, Firestore em prod (apenas eventos importantes).
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

type Level = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  level: Level;
  msg: string;
  ctx?: Record<string, unknown>;
}

const isDev = import.meta.env.DEV;

export const log = {
  info: (msg: string, ctx?: Record<string, unknown>) => emit({ level: 'info', msg, ctx }),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit({ level: 'warn', msg, ctx }),
  error: (msg: string, ctx?: Record<string, unknown>) => emit({ level: 'error', msg, ctx }),
  debug: (msg: string, ctx?: Record<string, unknown>) => isDev && emit({ level: 'debug', msg, ctx }),
};

function emit(p: LogPayload) {
  const tag = `[${p.level.toUpperCase()}]`;
  // eslint-disable-next-line no-console
  console[p.level === 'debug' ? 'log' : p.level](tag, p.msg, p.ctx ?? '');
}

export async function auditLog(action: string, detail: Record<string, unknown> = {}) {
  try {
    await addDoc(collection(db, 'logs'), {
      action,
      detail: JSON.stringify(detail).slice(0, 4000),
      userId: detail.userId ?? null,
      userEmail: detail.userEmail ?? null,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    log.warn('Falha em auditLog (provavelmente regras)', { err: String(e) });
  }
}
