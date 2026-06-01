import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Project } from '@/types';
import { PROJECT_PHASES } from '@/types';
import { rangesOverlap, formatDate } from '@/lib/utils';
import { useActiveAreaNames } from '@/hooks/useAreas';
import { nextWeeks, mondayOf, isoDate } from '@/lib/timeBuckets';

interface Props {
  projects: Project[];
}

const WEEK_PX = 36;
const PROJ_COL_PX = 240;

// Paleta dedicada por fase (cores fixas para consistência visual)
const PHASE_COLORS: Record<string, string> = {
  Design: '#60a5fa',
  Construction: '#7DD13C',
  SIT: '#f59e0b',
  UAT: '#fb923c',
  Transition: '#a78bfa',
  Training: '#f472b6',
  Cutover: '#ef4444',
  Hipercare: '#4ade80',
};

/** Timeline mostrando início/fim de cada fase de cada projeto, em escala semanal. */
export function ProjectTimeline({ projects }: Props) {
  const [periodMonths, setPeriodMonths] = useState<number>(6);
  const [areaFilter, setAreaFilter] = useState<string>('__all__');
  const [startDateIso, setStartDateIso] = useState<string>(
    () => isoDate(mondayOf(new Date()))
  );
  const filterByArea = areaFilter !== '__all__';

  // Botão: ajusta o início da janela para a menor data de início entre os projetos visíveis
  const fitToProjects = () => {
    const candidates: string[] = [];
    for (const p of projects) {
      if (filterByArea && (p.area ?? 'N/A') !== areaFilter) continue;
      if (p.startDate) candidates.push(p.startDate);
      for (const ph of p.phases ?? []) {
        if (ph.startDate) candidates.push(ph.startDate);
      }
    }
    if (candidates.length === 0) return;
    candidates.sort();
    // Pega o monday da semana da menor data
    const earliest = mondayOf(new Date(candidates[0] + 'T00:00:00'));
    setStartDateIso(isoDate(earliest));
  };

  const resetStart = () => setStartDateIso(isoDate(mondayOf(new Date())));

  // Áreas disponíveis (cadastradas + em uso pelos projetos)
  const cadastradas = useActiveAreaNames();
  const inUse = useMemo(
    () => Array.from(new Set(projects.map((p) => p.area).filter((a): a is string => !!a))),
    [projects]
  );
  const availableAreas = useMemo(
    () => Array.from(new Set([...cadastradas, ...inUse])).sort(),
    [cadastradas, inUse]
  );

  // Horizonte em semanas — começa em startDateIso (usuário pode mover para trás)
  const { weeks, horizonStart, horizonEnd, minMs, totalMs } = useMemo(() => {
    // Garante 2ª-feira para alinhamento limpo das colunas
    const startDate = mondayOf(new Date(startDateIso + 'T00:00:00'));
    const numWeeks = Math.round(periodMonths * 4.345);
    const wks = nextWeeks(numWeeks, startDate);
    const last = wks[wks.length - 1];
    const endDate = new Date(last.end + 'T00:00:00');
    const minMs = startDate.getTime();
    const totalMs = endDate.getTime() - startDate.getTime() + 24 * 3600 * 1000;
    return { weeks: wks, horizonStart: isoDate(startDate), horizonEnd: last.end, minMs, totalMs };
  }, [periodMonths, startDateIso]);

  // Projetos filtrados pela área. Inclui todos:
  // - Status "Cancelado" continua aparecendo (informação útil para histórico)
  // - Se faltar endDate, assumimos horizonte (projeto em andamento)
  // - Se faltar startDate, mostramos a linha sem barra geral (só fases)
  const visibleProjects = useMemo(() => {
    return projects
      .filter((p) => !filterByArea || (p.area ?? 'N/A') === areaFilter)
      .filter((p) => {
        // Quem tem datas: aceita se tocar o horizonte (assumindo endDate = horizonEnd se vazio)
        const startISO = p.startDate || '';
        const endISO = p.endDate || horizonEnd;

        const hasGeneralOverlap =
          startISO &&
          endISO &&
          rangesOverlap(startISO, endISO, horizonStart, horizonEnd);
        const hasPhaseOverlap = (p.phases ?? []).some(
          (ph) =>
            ph.startDate &&
            ph.endDate &&
            rangesOverlap(ph.startDate, ph.endDate, horizonStart, horizonEnd)
        );
        // Se não tem nenhuma data (nem início, nem fim, nem fase), também aparece —
        // útil para alertar o usuário a preencher datas.
        const hasNoDates =
          !p.startDate && !p.endDate && (p.phases ?? []).length === 0;

        return hasGeneralOverlap || hasPhaseOverlap || hasNoDates;
      });
  }, [projects, filterByArea, areaFilter, horizonStart, horizonEnd]);

  // Agrupa semanas em meses para o cabeçalho
  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; count: number }> = [];
    for (const w of weeks) {
      const d = new Date(w.start + 'T00:00:00');
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
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
          <h3 className="text-lg font-semibold">Timeline de Projetos por Fase</h3>
          <p className="text-xs text-muted-foreground">
            Período {horizonStart} → {horizonEnd} · {visibleProjects.length} projeto(s) visível(is)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Início:</span>
            <input
              type="date"
              value={startDateIso}
              onChange={(e) => setStartDateIso(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={fitToProjects}
              title="Move o início para a data mais antiga entre os projetos da área visível"
            >
              Ajustar aos projetos
            </Button>
            <Button variant="ghost" size="sm" onClick={resetStart} title="Volta o início para hoje">
              Hoje
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Período:</span>
            <Select value={String(periodMonths)} onValueChange={(v) => setPeriodMonths(Number(v))}>
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

      {/* Legenda de fases */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">Fases:</span>
        {PROJECT_PHASES.map((ph) => (
          <span key={ph} className="flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: PHASE_COLORS[ph] ?? '#888' }}
            />
            {ph}
          </span>
        ))}
      </div>

      {visibleProjects.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum projeto com datas dentro do período/área selecionado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${PROJ_COL_PX + totalWidth}px` }}>
            {/* Cabeçalho de meses */}
            <div className="grid" style={{ gridTemplateColumns: `${PROJ_COL_PX}px ${totalWidth}px` }}>
              <div className="text-sm font-medium text-muted-foreground">Projeto</div>
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

            {/* Cabeçalho de semanas */}
            <div className="mb-1 grid" style={{ gridTemplateColumns: `${PROJ_COL_PX}px ${totalWidth}px` }}>
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

            {/* Linhas de projetos */}
            {visibleProjects.map((p) => {
              const hasPhases = (p.phases ?? []).length > 0;
              return (
                <div
                  key={p.id}
                  className="grid items-center border-b py-2 last:border-b-0"
                  style={{ gridTemplateColumns: `${PROJ_COL_PX}px ${totalWidth}px` }}
                >
                  <div className="pr-2">
                    <p
                      className="truncate text-sm font-medium"
                      title={`${p.name} · ${p.area} · ${p.client ?? ''}`}
                    >
                      {p.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.area} ·{' '}
                      <Badge variant="outline" className="text-[9px]">
                        {p.status}
                      </Badge>
                      {!p.endDate && p.startDate && (
                        <span className="ml-1 italic">sem fim</span>
                      )}
                      {!p.startDate && !p.endDate && (
                        <span className="ml-1 italic text-destructive">
                          sem datas — edite o projeto
                        </span>
                      )}
                      {!hasPhases && p.startDate && (
                        <span className="ml-1 italic">sem fases</span>
                      )}
                    </p>
                  </div>
                  <div className="relative h-12 rounded bg-muted/40">
                    {/* Linhas verticais de semanas */}
                    {weeks.map((_, i) => (
                      <div
                        key={`grid-${p.id}-${i}`}
                        className="absolute top-0 h-full border-l border-border/30"
                        style={{ left: `${(i / weeks.length) * 100}%` }}
                      />
                    ))}

                    {/* Barra geral do projeto (atrás, mais fina).
                        Se faltar endDate, assume horizonte (projeto em andamento). */}
                    {p.startDate && (() => {
                      const endRaw = p.endDate || horizonEnd;
                      const sIso = p.startDate > horizonStart ? p.startDate : horizonStart;
                      const eIso = endRaw < horizonEnd ? endRaw : horizonEnd;
                      if (sIso > eIso) return null;
                      const s = new Date(sIso + 'T00:00:00').getTime();
                      const e = new Date(eIso + 'T00:00:00').getTime();
                      const left = ((s - minMs) / totalMs) * 100;
                      const width = ((e - s) / totalMs) * 100;
                      const isOpen = !p.endDate;
                      return (
                        <div
                          title={
                            isOpen
                              ? `Projeto: ${formatDate(p.startDate)} → (sem fim definido)`
                              : `Projeto: ${formatDate(p.startDate)} → ${formatDate(p.endDate)}`
                          }
                          className={
                            'absolute top-1 h-2 rounded ' +
                            (isOpen
                              ? 'bg-muted-foreground/30 border-r-2 border-dashed border-muted-foreground'
                              : 'bg-muted-foreground/30')
                          }
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                        />
                      );
                    })()}

                    {/* Barras de fases */}
                    {(p.phases ?? []).map((ph, i) => {
                      if (!ph.startDate || !ph.endDate) return null;
                      const sIso = ph.startDate > horizonStart ? ph.startDate : horizonStart;
                      const eIso = ph.endDate < horizonEnd ? ph.endDate : horizonEnd;
                      if (sIso > eIso) return null;
                      const s = new Date(sIso + 'T00:00:00').getTime();
                      const e = new Date(eIso + 'T00:00:00').getTime();
                      const left = ((s - minMs) / totalMs) * 100;
                      const width = ((e - s) / totalMs) * 100;
                      return (
                        <div
                          key={`ph-${p.id}-${i}`}
                          title={`${ph.phase}: ${formatDate(ph.startDate)} → ${formatDate(ph.endDate)}`}
                          className="absolute top-5 h-6 overflow-hidden rounded text-[10px] text-white"
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(width, 0.5)}%`,
                            backgroundColor: PHASE_COLORS[ph.phase] ?? '#888',
                          }}
                        >
                          <span className="block truncate px-1.5 leading-6">{ph.phase}</span>
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
