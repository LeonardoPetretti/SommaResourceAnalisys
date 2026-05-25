import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Allocation, Resource } from '@/types';
import { formatPercent, rangesOverlap } from '@/lib/utils';
import { useActiveAreaNames } from '@/hooks/useAreas';
import { nextWeeks, mondayOf, isoDate } from '@/lib/timeBuckets';

interface Props {
  allocations: Allocation[];
  resources: Resource[];
}

const WEEK_PX = 36;
const RES_COL_PX = 220;

/** Timeline com filtros de período (1-12 meses) e área. Eixo X em semanas. */
export function AllocationTimeline({ allocations, resources }: Props) {
  const [periodMonths, setPeriodMonths] = useState<number>(6);
  const [areaFilter, setAreaFilter] = useState<string>('__all__');
  const filterByArea = areaFilter !== '__all__';

  // Áreas disponíveis: união de áreas cadastradas e áreas em uso pelos recursos
  const cadastradas = useActiveAreaNames();
  const inUse = useMemo(
    () =>
      Array.from(
        new Set(resources.map((r) => r.area).filter((a): a is string => !!a))
      ),
    [resources]
  );
  const availableAreas = useMemo(
    () => Array.from(new Set([...cadastradas, ...inUse])).sort(),
    [cadastradas, inUse]
  );

  // Horizonte em semanas a partir da 2ª-feira da semana atual
  const { weeks, horizonStart, horizonEnd, minMs, totalMs } = useMemo(() => {
    const startDate = mondayOf(new Date());
    // Aproximação: 1 mês ≈ 4.345 semanas
    const numWeeks = Math.round(periodMonths * 4.345);
    const wks = nextWeeks(numWeeks, startDate);
    const last = wks[wks.length - 1];
    const endDate = new Date(last.end + 'T00:00:00');
    const minMs = startDate.getTime();
    // +1 dia para inclusividade
    const totalMs = endDate.getTime() - startDate.getTime() + 24 * 3600 * 1000;
    return {
      weeks: wks,
      horizonStart: isoDate(startDate),
      horizonEnd: last.end,
      minMs,
      totalMs,
    };
  }, [periodMonths]);

  // Aplica filtro de área aos recursos
  const filteredResources = useMemo(() => {
    return filterByArea
      ? resources.filter((r) => (r.area ?? 'N/A') === areaFilter)
      : resources;
  }, [resources, filterByArea, areaFilter]);

  // Aloca­ções que ocorrem dentro do horizonte e pertencem a recursos filtrados
  const filteredAllocations = useMemo(() => {
    const allowed = new Set(filteredResources.map((r) => r.id));
    return allocations.filter(
      (a) =>
        allowed.has(a.resourceId) &&
        rangesOverlap(a.startDate, a.endDate, horizonStart, horizonEnd)
    );
  }, [allocations, filteredResources, horizonStart, horizonEnd]);

  // Agrupa por recurso
  const byResource = useMemo(() => {
    const m = new Map<string, Allocation[]>();
    for (const a of filteredAllocations) {
      const arr = m.get(a.resourceId) ?? [];
      arr.push(a);
      m.set(a.resourceId, arr);
    }
    return m;
  }, [filteredAllocations]);

  // Mostra todos os recursos filtrados, mesmo sem alocação (linhas vazias)
  // ou apenas com alocação? Vou mostrar só com alocação para limpar visual.
  const visibleResources = filteredResources.filter((r) => byResource.has(r.id));

  // Agrupa semanas por mês para o cabeçalho superior
  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; count: number }> = [];
    for (const w of weeks) {
      const d = new Date(w.start + 'T00:00:00');
      const label = d.toLocaleDateString('pt-BR', {
        month: 'short',
        year: '2-digit',
      });
      if (groups.length > 0 && groups[groups.length - 1].label === label) {
        groups[groups.length - 1].count++;
      } else {
        groups.push({ label, count: 1 });
      }
    }
    return groups;
  }, [weeks]);

  const totalWidth = weeks.length * WEEK_PX;

  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Timeline de Alocações</h3>
          <p className="text-xs text-muted-foreground">
            Período {horizonStart} → {horizonEnd} · {visibleResources.length} recurso(s) ·{' '}
            {filteredAllocations.length} alocação(ões)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Período:</span>
            <Select
              value={String(periodMonths)}
              onValueChange={(v) => setPeriodMonths(Number(v))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} {m === 1 ? 'mês' : 'meses'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Área:</span>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as áreas</SelectItem>
                {availableAreas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {visibleResources.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sem alocações no período/área selecionado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${RES_COL_PX + totalWidth}px` }}>
            {/* Linha 1: cabeçalho de meses */}
            <div
              className="grid"
              style={{ gridTemplateColumns: `${RES_COL_PX}px ${totalWidth}px` }}
            >
              <div className="text-sm font-medium text-muted-foreground">
                Recurso
              </div>
              <div className="flex border-b">
                {monthGroups.map((g, i) => (
                  <div
                    key={i}
                    className="border-l px-1 text-center text-xs font-medium text-muted-foreground"
                    style={{ width: `${g.count * WEEK_PX}px` }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Linha 2: cabeçalho de semanas (dia/mês inicial de cada semana) */}
            <div
              className="mb-1 grid"
              style={{ gridTemplateColumns: `${RES_COL_PX}px ${totalWidth}px` }}
            >
              <div />
              <div className="flex border-b pb-1">
                {weeks.map((w, i) => (
                  <div
                    key={i}
                    className="border-l text-center text-[9px] text-muted-foreground"
                    style={{ width: `${WEEK_PX}px` }}
                    title={`${w.start} → ${w.end}`}
                  >
                    {w.label.split('/')[0]}
                  </div>
                ))}
              </div>
            </div>

            {/* Barras por recurso */}
            {visibleResources.map((r) => {
              const allocs = byResource.get(r.id) ?? [];
              const overloaded = allocs.some((a) => {
                let sum = a.fte;
                for (const b of allocs) {
                  if (b.id === a.id) continue;
                  if (rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
                    sum += b.fte;
                  }
                }
                return sum > (r.capacity ?? 1) + 0.0001;
              });

              return (
                <div
                  key={r.id}
                  className="grid items-center border-b py-2 last:border-b-0"
                  style={{ gridTemplateColumns: `${RES_COL_PX}px ${totalWidth}px` }}
                >
                  <div className="pr-2">
                    <p
                      className="truncate text-sm font-medium"
                      title={`${r.name} · ${r.area ?? ''}`}
                    >
                      {r.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.area ?? '—'} · cap {formatPercent(r.capacity ?? 1)}
                      {overloaded && (
                        <span className="ml-1 text-destructive">⚠ sobrecarga</span>
                      )}
                    </p>
                  </div>
                  <div className="relative h-8 rounded bg-muted/40">
                    {/* Linhas verticais de semanas */}
                    {weeks.map((_, i) => (
                      <div
                        key={`grid-${r.id}-${i}`}
                        className="absolute top-0 h-full border-l border-border/30"
                        style={{ left: `${(i / weeks.length) * 100}%` }}
                      />
                    ))}
                    {allocs.map((a) => {
                      // Clamp ao horizonte
                      const sIso =
                        a.startDate > horizonStart ? a.startDate : horizonStart;
                      const eIso = a.endDate < horizonEnd ? a.endDate : horizonEnd;
                      const s = new Date(sIso + 'T00:00:00').getTime();
                      const e = new Date(eIso + 'T00:00:00').getTime();
                      const left = ((s - minMs) / totalMs) * 100;
                      const width = ((e - s) / totalMs) * 100;
                      const opacity = Math.max(0.45, Math.min(1, a.fte));
                      return (
                        <div
                          key={a.id}
                          title={`${a.projectName ?? ''} · ${a.phase} · ${formatPercent(a.fte)} · ${a.startDate} → ${a.endDate}`}
                          className="absolute top-1 h-6 overflow-hidden rounded bg-primary text-[10px] text-primary-foreground"
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(width, 0.5)}%`,
                            opacity,
                          }}
                        >
                          <span className="block truncate px-1.5 leading-6">
                            {a.projectName ?? ''} {formatPercent(a.fte)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
