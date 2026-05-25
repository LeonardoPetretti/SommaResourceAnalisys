import type { Allocation } from '@/types';

/** Retorna a data ISO (yyyy-mm-dd) do dia especificado. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adiciona N dias a uma data (cria nova instância). */
export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Segunda-feira da semana da data informada. */
export function mondayOf(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay(); // 0=Dom,1=Seg,...,6=Sab
  const diff = dow === 0 ? -6 : 1 - dow; // se domingo, volta 6 dias
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Gera N semanas a partir da segunda-feira atual. */
export interface WeekBucket {
  index: number;
  start: string; // ISO Mon
  end: string; // ISO Sun
  label: string; // "13/jan" ou similar
  monthLabel: string; // "jan/26"
}

export function nextWeeks(count: number, from?: Date): WeekBucket[] {
  const start = mondayOf(from ?? new Date());
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < count; i++) {
    const wStart = addDays(start, i * 7);
    const wEnd = addDays(wStart, 6);
    const monthShort = wStart.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const yearShort = String(wStart.getFullYear()).slice(2);
    buckets.push({
      index: i,
      start: isoDate(wStart),
      end: isoDate(wEnd),
      label: `${String(wStart.getDate()).padStart(2, '0')}/${monthShort}`,
      monthLabel: `${monthShort}/${yearShort}`,
    });
  }
  return buckets;
}

/** Quantos dias de [allocStart, allocEnd] caem em [windowStart, windowEnd]. */
export function overlapDays(
  allocStart: string,
  allocEnd: string,
  windowStart: string,
  windowEnd: string
): number {
  const a = allocStart > windowStart ? allocStart : windowStart;
  const b = allocEnd < windowEnd ? allocEnd : windowEnd;
  if (a > b) return 0;
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.floor((db.getTime() - da.getTime()) / 86_400_000) + 1;
}

/**
 * FTE-dias consumidos por dia da semana (0=Seg..6=Dom) num horizonte.
 * Para cada alocação, expande sobre o intervalo (clamped no horizonte) e
 * incrementa o bucket do dia da semana com seu FTE.
 */
export function ftePerWeekday(
  allocations: Allocation[],
  horizonStart: string,
  horizonEnd: string
): number[] {
  // weekday: 0=Seg, 1=Ter, ..., 6=Dom (para alinhar com calendário pt-BR)
  const buckets = new Array(7).fill(0);
  const hStart = new Date(horizonStart + 'T00:00:00');
  const hEnd = new Date(horizonEnd + 'T00:00:00');

  for (const a of allocations) {
    const s = new Date(
      (a.startDate > horizonStart ? a.startDate : horizonStart) + 'T00:00:00'
    );
    const e = new Date(
      (a.endDate < horizonEnd ? a.endDate : horizonEnd) + 'T00:00:00'
    );
    if (s > e) continue;
    if (s > hEnd || e < hStart) continue;

    const fte = a.fte ?? 0;
    // Itera dia a dia (clamp já aplicado)
    let cursor = new Date(s);
    while (cursor <= e) {
      const jsDow = cursor.getDay(); // 0=Dom..6=Sab
      const idx = jsDow === 0 ? 6 : jsDow - 1; // 0=Seg..6=Dom
      buckets[idx] += fte;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return buckets.map((v) => Number(v.toFixed(2)));
}

/** Cor HSL para um valor de utilização 0..>1+ (mapa de calor). */
export function utilizationColor(util: number): string {
  if (util <= 0) return 'hsl(220, 15%, 18%)'; // cinza (vazio)
  if (util > 1) return 'hsl(0, 75%, 50%)'; // vermelho (sobrealocação)
  // Interpolação verde → amarelo → laranja conforme util cresce
  // 0..0.6 = verde (claro→médio), 0.6..0.85 = amarelo, 0.85..1 = laranja
  if (util < 0.6) {
    // hue 95, saturação 70%, lightness 30..50
    const l = 30 + (util / 0.6) * 20;
    return `hsl(95, 70%, ${l}%)`;
  }
  if (util < 0.85) {
    const t = (util - 0.6) / 0.25;
    const h = 95 - t * 45; // 95 → 50
    return `hsl(${h.toFixed(0)}, 75%, 50%)`;
  }
  const t = (util - 0.85) / 0.15;
  const h = 50 - t * 30; // 50 → 20
  return `hsl(${h.toFixed(0)}, 85%, 50%)`;
}
