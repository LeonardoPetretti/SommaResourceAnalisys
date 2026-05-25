import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input?: string | Date | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input + 'T00:00:00') : input;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

export function toISODate(input?: string | Date | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function parsePtDate(input: string): string {
  if (!input) return '';
  const s = input.trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial date
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 25569) {
      const ms = (n - 25569) * 86400 * 1000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function parsePercent(input: string | number): number {
  if (typeof input === 'number') {
    return input > 1 ? input / 100 : input;
  }
  const s = String(input ?? '').trim().replace(',', '.').replace('%', '');
  const n = Number(s);
  if (Number.isNaN(n)) return 0;
  return n > 1 ? n / 100 : n;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 250) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
