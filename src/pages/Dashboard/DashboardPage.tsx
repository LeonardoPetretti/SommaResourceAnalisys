import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  Briefcase,
  CalendarClock,
  AlertTriangle,
  Battery,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Heatmap, type HeatmapCell } from '@/components/dashboard/Heatmap';
import { useAllocations } from '@/hooks/useAllocations';
import { useResources } from '@/hooks/useResources';
import { useProjects } from '@/hooks/useProjects';
import { rangesOverlap, formatPercent, formatDate, cn } from '@/lib/utils';
import {
  nextWeeks,
  ftePerWeekday,
  addDays,
  isoDate,
} from '@/lib/timeBuckets';
import { freeCapacity, normSkill, resourceHasSkill } from '@/lib/skillsAnalysis';
import type { Allocation, Project, Resource } from '@/types';
import { PROJECT_PHASES } from '@/types';

const WEEKS_AHEAD = 24; // 6 meses
const HORIZON_DAYS = WEEKS_AHEAD * 7;

const STATUS_COLORS: Record<string, string> = {
  'Planejado': '#94a3b8',
  'Em Andamento': '#7DD13C',
  'Pausado': '#f59e0b',
  'Concluído': '#4ade80',
  'Cancelado': '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Baixa': '#94a3b8',
  'Média': '#7DD13C',
  'Alta': '#f59e0b',
  'Crítica': '#ef4444',
};

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

type Drill =
  | null
  | { kind: 'conflicts' }
  | { kind: 'resources' }
  | { kind: 'projects-active' }
  | { kind: 'allocations-active' }
  | { kind: 'idle-capacity' }
  | { kind: 'projects-by-status'; status: string }
  | { kind: 'projects-by-priority'; priority: string }
  | { kind: 'phase'; phase: string }
  | { kind: 'weekday'; weekday: string; weekdayIdx: number }
  | { kind: 'heatmap-cell'; area: string; weekStart: string; weekEnd: string; weekLabel: string }
  | {
      kind: 'heatmap-resource-cell';
      resourceId: string;
      weekStart: string;
      weekEnd: string;
      weekLabel: string;
    }
  | { kind: 'skill'; skill: string }
  | { kind: 'resource'; resourceId: string };

export function DashboardPage() {
  const { data: allocations = [], isLoading: la } = useAllocations();
  const { data: resources = [], isLoading: lr } = useResources();
  const { data: projects = [], isLoading: lp } = useProjects();
  const isLoading = la || lr || lp;
  const [drill, setDrill] = useState<Drill>(null);
  const [dashArea, setDashArea] = useState<string>('__all__');

  const today = isoDate(new Date());
  const horizonStart = today;
  const horizonEnd = isoDate(addDays(new Date(), HORIZON_DAYS));

  // ===== Filtro global de área =====
  const filterByArea = dashArea !== '__all__';

  // Lista de áreas unificada (recursos + projetos) para o dropdown global
  const areasAll = useMemo(() => {
    const s = new Set<string>();
    for (const r of resources) if (r.area) s.add(r.area);
    for (const p of projects) if (p.area) s.add(p.area);
    return Array.from(s).sort();
  }, [resources, projects]);

  // Coleções filtradas
  const fResources = useMemo(
    () =>
      filterByArea
        ? resources.filter((r) => (r.area ?? 'N/A') === dashArea)
        : resources,
    [resources, dashArea, filterByArea]
  );
  const fProjects = useMemo(
    () =>
      filterByArea
        ? projects.filter((p) => (p.area ?? 'N/A') === dashArea)
        : projects,
    [projects, dashArea, filterByArea]
  );
  const fResourceIds = useMemo(
    () => new Set(fResources.map((r) => r.id)),
    [fResources]
  );
  const fAllocations = useMemo(
    () =>
      filterByArea
        ? allocations.filter((a) => fResourceIds.has(a.resourceId))
        : allocations,
    [allocations, fResourceIds, filterByArea]
  );

  // ===== KPIs =====
  const activeProjects = useMemo(
    () => fProjects.filter((p) => p.status === 'Em Andamento'),
    [fProjects]
  );
  // "Vigentes" = ativas hoje OU planejadas para começar dentro do horizonte de 24 semanas.
  // Mais útil para um dashboard de planejamento do que considerar só "hoje".
  const activeAllocations = useMemo(
    () =>
      fAllocations.filter(
        (a) =>
          a.startDate <= horizonEnd && a.endDate >= today
        // overlap com [today, horizonEnd]
      ),
    [fAllocations, today, horizonEnd]
  );

  // Para detalhamento: separar em "ativas hoje" vs "planejadas no horizonte"
  const allocationsActiveToday = useMemo(
    () => fAllocations.filter((a) => a.startDate <= today && a.endDate >= today),
    [fAllocations, today]
  );
  const allocationsPlannedAhead = useMemo(
    () => fAllocations.filter((a) => a.startDate > today && a.startDate <= horizonEnd),
    [fAllocations, today, horizonEnd]
  );

  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    const byRes = new Map<string, Allocation[]>();
    for (const a of fAllocations) {
      const arr = byRes.get(a.resourceId) ?? [];
      arr.push(a);
      byRes.set(a.resourceId, arr);
    }
    for (const [rid, arr] of byRes) {
      const cap = fResources.find((r) => r.id === rid)?.capacity ?? 1;
      for (const a of arr) {
        let sum = a.fte;
        for (const b of arr) {
          if (a.id === b.id) continue;
          if (rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
            sum += b.fte;
          }
        }
        if (sum > cap + 1e-9) set.add(a.id);
      }
    }
    return set;
  }, [fAllocations, fResources]);

  // ===== Capacidade ociosa total no horizonte =====
  const idleByResource = useMemo(() => {
    return fResources.map((r) => ({
      resource: r,
      free: freeCapacity(r, fAllocations, horizonStart, horizonEnd),
    }));
  }, [fResources, fAllocations, horizonStart, horizonEnd]);

  const totalIdle = useMemo(
    () => idleByResource.reduce((s, x) => s + x.free, 0),
    [idleByResource]
  );

  const idleByArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const { resource, free } of idleByResource) {
      const area = resource.area ?? 'N/A';
      map.set(area, (map.get(area) ?? 0) + free);
    }
    return Array.from(map.entries())
      .map(([name, fte]) => ({ name, fte: Number(fte.toFixed(2)) }))
      .sort((a, b) => b.fte - a.fte);
  }, [idleByResource]);

  // ===== Heatmap Ocupacional =====
  const weeks = useMemo(() => nextWeeks(WEEKS_AHEAD), []);
  const areas = useMemo(
    () => Array.from(new Set(resources.map((r) => r.area ?? 'N/A'))).sort(),
    [resources]
  );

  // Modo "todas as áreas": rows = áreas; modo área específica: rows = recursos da área
  const showAllAreas = dashArea === '__all__';

  const heatmapRows: string[] = useMemo(() => {
    if (showAllAreas) return areas;
    return fResources.map((r) => r.name);
  }, [showAllAreas, areas, fResources]);

  const heatmapResourceIds: string[] = useMemo(() => {
    if (showAllAreas) return [];
    return fResources.map((r) => r.id);
  }, [showAllAreas, fResources]);

  const heatmapCells: HeatmapCell[][] = useMemo(() => {
    if (showAllAreas) {
      // Agrega por área (usa coleções não filtradas — modo global)
      return areas.map((area) => {
        const areaResources = resources.filter((r) => (r.area ?? 'N/A') === area);
        const totalCap = areaResources.reduce((s, r) => s + (r.capacity ?? 1), 0);
        return weeks.map((w) => {
          let used = 0;
          for (const a of allocations) {
            if (!rangesOverlap(a.startDate, a.endDate, w.start, w.end)) continue;
            const res = areaResources.find((r) => r.id === a.resourceId);
            if (!res) continue;
            used += a.fte ?? 0;
          }
          const util = totalCap > 0 ? used / totalCap : 0;
          return {
            util,
            detail: `${w.label} (semana ${w.start})`,
            meta: { area, weekStart: w.start, weekEnd: w.end, weekLabel: w.label },
          };
        });
      });
    }

    // Modo recurso: cada linha = um recurso da área
    const areaResources = resources.filter((r) => (r.area ?? 'N/A') === dashArea);
    return areaResources.map((r) => {
      const cap = r.capacity ?? 1;
      return weeks.map((w) => {
        let used = 0;
        for (const a of allocations) {
          if (a.resourceId !== r.id) continue;
          if (!rangesOverlap(a.startDate, a.endDate, w.start, w.end)) continue;
          used += a.fte ?? 0;
        }
        const util = cap > 0 ? used / cap : 0;
        return {
          util,
          detail: `${w.label} (semana ${w.start})`,
          meta: {
            resourceId: r.id,
            resourceName: r.name,
            weekStart: w.start,
            weekEnd: w.end,
            weekLabel: w.label,
          },
        };
      });
    });
  }, [showAllAreas, areas, resources, allocations, weeks, dashArea]);

  const weekColLabels = useMemo(() => weeks.map((w) => w.label), [weeks]);
  const weekSubLabels = useMemo(() => weeks.map((w) => w.monthLabel), [weeks]);

  // ===== Consumo por dia da semana =====
  const weekdayData = useMemo(() => {
    const arr = ftePerWeekday(fAllocations, horizonStart, horizonEnd);
    return arr.map((v, i) => ({ name: WEEKDAY_LABELS[i], value: v }));
  }, [fAllocations, horizonStart, horizonEnd]);

  // ===== Ranking de Disponibilidade por Skill =====
  const skillRanking = useMemo(() => {
    const skillMap = new Map<string, { display: string; resources: Resource[] }>();
    for (const r of fResources) {
      for (const sk of r.skills ?? []) {
        const key = normSkill(sk);
        if (!key) continue;
        const entry = skillMap.get(key) ?? { display: sk, resources: [] };
        entry.resources.push(r);
        skillMap.set(key, entry);
      }
    }
    const rows: Array<{ skill: string; free: number; total: number; count: number; util: number }> = [];
    for (const [, { display, resources: arr }] of skillMap) {
      let total = 0;
      let free = 0;
      for (const r of arr) {
        total += r.capacity ?? 1;
        free += freeCapacity(r, fAllocations, horizonStart, horizonEnd);
      }
      const util = total > 0 ? (total - free) / total : 0;
      rows.push({
        skill: display,
        free: Number(free.toFixed(2)),
        total: Number(total.toFixed(2)),
        count: arr.length,
        util,
      });
    }
    return rows.sort((a, b) => b.free - a.free).slice(0, 12);
  }, [fResources, fAllocations, horizonStart, horizonEnd]);

  // ===== Status / Prioridade =====
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of fProjects) map.set(p.status, (map.get(p.status) ?? 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [fProjects]);

  const priorityData = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of fProjects) map.set(p.priority, (map.get(p.priority) ?? 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [fProjects]);

  // ===== Distribuição por Fase (pipeline de execução dos projetos) =====
  const phaseData = useMemo(() => {
    // Considera alocações vigentes (período toca hoje)
    const today = new Date().toISOString().slice(0, 10);
    const aggregate = new Map<string, { count: number; fte: number }>();
    for (const ph of PROJECT_PHASES) aggregate.set(ph, { count: 0, fte: 0 });
    for (const a of fAllocations) {
      if (!(a.startDate <= today && a.endDate >= today)) continue;
      const ph = (a.phase ?? '').trim();
      if (!ph) continue;
      const cur = aggregate.get(ph) ?? { count: 0, fte: 0 };
      cur.count += 1;
      cur.fte += a.fte ?? 0;
      aggregate.set(ph, cur);
    }
    return PROJECT_PHASES.map((name) => ({
      name,
      count: aggregate.get(name)?.count ?? 0,
      fte: Number((aggregate.get(name)?.fte ?? 0).toFixed(2)),
    }));
  }, [fAllocations]);

  // ===== Carga atual por recurso (top 10) =====
  const resourceLoad = useMemo(() => {
    return fResources
      .map((r) => {
        const load = fAllocations
          .filter((a) => a.resourceId === r.id && a.startDate <= today && a.endDate >= today)
          .reduce((acc, a) => acc + (a.fte ?? 0), 0);
        return {
          id: r.id,
          name: r.name,
          area: r.area,
          capacity: r.capacity ?? 1,
          load,
          util: r.capacity > 0 ? load / r.capacity : 0,
        };
      })
      .sort((a, b) => b.util - a.util)
      .slice(0, 10);
  }, [fResources, fAllocations, today]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Clique nos cartões, gráficos e células para detalhar · Horizonte: ${WEEKS_AHEAD} semanas`}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Área:</span>
            <Select value={dashArea} onValueChange={setDashArea}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as áreas (visão global)</SelectItem>
                {areasAll.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {filterByArea && (
        <div className="rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-sm">
          Mostrando dados da área <strong>{dashArea}</strong>.{' '}
          <button
            className="underline hover:text-primary"
            onClick={() => setDashArea('__all__')}
          >
            Limpar filtro
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Recursos"
          value={fResources.length}
          hint={filterByArea ? `de ${resources.length} no total` : 'Clique para listar todos'}
          onClick={() => setDrill({ kind: 'resources' })}
        />
        <KpiCard
          icon={<Briefcase className="h-5 w-5" />}
          label="Projetos ativos"
          value={activeProjects.length}
          hint={filterByArea ? `${fProjects.length} na área (${projects.length} totais)` : `${projects.length} no total`}
          onClick={() => setDrill({ kind: 'projects-active' })}
        />
        <KpiCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Alocações vigentes"
          value={activeAllocations.length}
          hint={`${allocationsActiveToday.length} ativa(s) hoje + ${allocationsPlannedAhead.length} planejada(s) no horizonte`}
          onClick={() => setDrill({ kind: 'allocations-active' })}
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Conflitos"
          value={conflictIds.size}
          hint={conflictIds.size > 0 ? 'Clique para detalhar' : 'Sem sobrealocação'}
          tone={conflictIds.size > 0 ? 'warning' : 'default'}
          onClick={() => conflictIds.size > 0 && setDrill({ kind: 'conflicts' })}
        />
        <KpiCard
          icon={<Battery className="h-5 w-5" />}
          label="Capacidade ociosa"
          value={formatPercent(totalIdle)}
          hint={`Em ${WEEKS_AHEAD} semanas · clique para detalhar`}
          tone="accent"
          onClick={() => setDrill({ kind: 'idle-capacity' })}
        />
      </div>

      {/* Status / Prioridade */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projetos por Status</CardTitle>
            <CardDescription>Clique numa fatia para detalhar</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {statusData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                    onClick={(d: any) =>
                      d?.name && setDrill({ kind: 'projects-by-status', status: d.name })
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {statusData.map((entry, i) => (
                      <Cell
                        key={`status-${i}`}
                        fill={STATUS_COLORS[entry.name] ?? '#888'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projetos por Prioridade</CardTitle>
            <CardDescription>Clique numa barra para detalhar</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {priorityData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    onClick={(d: any) =>
                      d?.name && setDrill({ kind: 'projects-by-priority', priority: d.name })
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {priorityData.map((entry, i) => (
                      <Cell
                        key={`prio-${i}`}
                        fill={PRIORITY_COLORS[entry.name] ?? '#888'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline de Fases de Projeto */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Fase de Projeto</CardTitle>
          <CardDescription>
            Pipeline de execução: quantas alocações vigentes e quanto FTE somado em cada
            fase do ciclo (Design → Hipercare). Clique numa barra para ver as alocações.
            {filterByArea && (
              <span className="ml-1 somma-text-accent">
                · Filtro: área "{dashArea}"
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {phaseData.every((p) => p.count === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={phaseData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(value: any, name: string) =>
                    name === 'count'
                      ? [`${value} alocação(ões)`, 'Quantidade']
                      : [formatPercent(Number(value)), 'FTE somado']
                  }
                />
                <Legend
                  formatter={(v: string) => (v === 'count' ? 'Quantidade' : 'FTE somado')}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  onClick={(d: any) => d?.name && setDrill({ kind: 'phase', phase: d.name })}
                  style={{ cursor: 'pointer' }}
                />
                <Bar
                  dataKey="fte"
                  fill="hsl(var(--somma-green-bright))"
                  onClick={(d: any) => d?.name && setDrill({ kind: 'phase', phase: d.name })}
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Mapa de Calor Ocupacional */}
      <Card>
        <CardHeader>
          <CardTitle>Mapa de Calor Ocupacional</CardTitle>
          <CardDescription>
            {showAllAreas
              ? `Utilização média por área nas próximas ${WEEKS_AHEAD} semanas. Selecione uma área no filtro do topo para detalhar por recurso.`
              : `Utilização por recurso na área "${dashArea}" nas próximas ${WEEKS_AHEAD} semanas.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {showAllAreas
                ? 'Sem áreas cadastradas.'
                : `Nenhum recurso cadastrado na área "${dashArea}".`}
            </p>
          ) : (
            <Heatmap
              rows={heatmapRows}
              columns={weekColLabels}
              columnSubLabels={weekSubLabels}
              cells={heatmapCells}
              cellSize={28}
              onCellClick={(ri, ci, cell) => {
                if (showAllAreas) {
                  setDrill({
                    kind: 'heatmap-cell',
                    area: heatmapRows[ri],
                    weekStart: cell.meta?.weekStart,
                    weekEnd: cell.meta?.weekEnd,
                    weekLabel: cell.meta?.weekLabel ?? weekColLabels[ci],
                  });
                } else {
                  setDrill({
                    kind: 'heatmap-resource-cell',
                    resourceId: heatmapResourceIds[ri],
                    weekStart: cell.meta?.weekStart,
                    weekEnd: cell.meta?.weekEnd,
                    weekLabel: cell.meta?.weekLabel ?? weekColLabels[ci],
                  });
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Dia da semana + Skill ranking */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Consumo por Dia da Semana</CardTitle>
            <CardDescription>
              FTE-dias somados em {WEEKS_AHEAD} semanas. Cada barra = soma de FTE × dias que
              caem naquele dia da semana. Clique para detalhar recursos e projetos contribuindo.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(value: any) => [`${value} FTE-dias`, 'Consumo']}
                />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  onClick={(d: any, i: number) =>
                    d?.name &&
                    setDrill({ kind: 'weekday', weekday: d.name, weekdayIdx: i })
                  }
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Ranking de Disponibilidade por Skill
              {filterByArea && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  Área: {dashArea}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              FTE livre no horizonte (clique para ver os recursos).
              {filterByArea
                ? ` Considera apenas recursos da área "${dashArea}".`
                : ' Considera recursos de todas as áreas.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {skillRanking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cadastre skills nos recursos para ver o ranking.</p>
            ) : (
              <div className="space-y-2">
                {skillRanking.map((s) => {
                  const pctUtil = Math.min(100, Math.round(s.util * 100));
                  return (
                    <button
                      key={s.skill}
                      onClick={() => setDrill({ kind: 'skill', skill: s.skill })}
                      className="w-full rounded-md p-2 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.skill}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {s.count} recurso(s)
                          </Badge>
                        </div>
                        <span className="font-semibold text-primary">
                          {formatPercent(s.free)} livre
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Progress value={pctUtil} className="h-1.5" />
                        <span className="text-[10px] text-muted-foreground">
                          {pctUtil}% ocupado
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 10 utilização */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 utilização de recursos (hoje)</CardTitle>
          <CardDescription>Clique num recurso para ver suas alocações</CardDescription>
        </CardHeader>
        <CardContent>
          {resourceLoad.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados de alocação para hoje.</p>
          ) : (
            <div className="space-y-3">
              {resourceLoad.map((r) => {
                const pct = Math.min(100, Math.round(r.util * 100));
                const over = r.util > r.capacity + 1e-9;
                return (
                  <button
                    key={r.id}
                    onClick={() => setDrill({ kind: 'resource', resourceId: r.id })}
                    className="w-full space-y-1 rounded-md p-2 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.area}
                        </Badge>
                      </div>
                      <span
                        className={
                          over
                            ? 'font-semibold text-destructive'
                            : 'text-muted-foreground'
                        }
                      >
                        {formatPercent(r.load)} / {formatPercent(r.capacity)}
                      </span>
                    </div>
                    <Progress value={pct} />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DrillDialog
        drill={drill}
        onOpenChange={(v) => !v && setDrill(null)}
        resources={fResources}
        projects={fProjects}
        allocations={fAllocations}
        conflictIds={conflictIds}
        activeAllocations={activeAllocations}
        activeProjects={activeProjects}
        idleByArea={idleByArea}
        idleByResource={idleByResource}
        horizonStart={horizonStart}
        horizonEnd={horizonEnd}
        filterByArea={filterByArea}
        dashArea={dashArea}
      />
    </div>
  );
}

// ============================ KPI ============================
function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'warning' | 'accent';
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <Card
      onClick={onClick}
      className={cn(
        clickable && 'cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40'
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p
              className={cn(
                'mt-1 text-3xl font-bold',
                tone === 'warning' && Number(value) > 0 && 'text-destructive',
                tone === 'accent' && 'text-primary'
              )}
            >
              {value}
            </p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados para exibir
    </div>
  );
}

// ============================ DRILL DIALOG ============================
function DrillDialog({
  drill,
  onOpenChange,
  resources,
  projects,
  allocations,
  conflictIds,
  activeAllocations,
  activeProjects,
  idleByArea,
  idleByResource,
  horizonStart,
  horizonEnd,
  filterByArea,
  dashArea,
}: {
  drill: Drill;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
  projects: Project[];
  allocations: Allocation[];
  conflictIds: Set<string>;
  activeAllocations: Allocation[];
  activeProjects: Project[];
  idleByArea: Array<{ name: string; fte: number }>;
  idleByResource: Array<{ resource: Resource; free: number }>;
  horizonStart: string;
  horizonEnd: string;
  filterByArea: boolean;
  dashArea: string;
}) {
  const nav = useNavigate();
  if (!drill) return null;

  const rByName = new Map(resources.map((r) => [r.id, r]));
  const today = new Date().toISOString().slice(0, 10);

  let title = '';
  let description = '';
  let body: React.ReactNode = null;
  let openLink: { label: string; path: string } | null = null;

  switch (drill.kind) {
    case 'resources': {
      title = 'Todos os recursos';
      description = `${resources.length} cadastrados`;
      openLink = { label: 'Abrir página Recursos', path: '/resources' };
      body = (
        <ResourcesTable
          rows={resources.map((r) => {
            const load = allocations
              .filter((a) => a.resourceId === r.id && a.startDate <= today && a.endDate >= today)
              .reduce((acc, a) => acc + (a.fte ?? 0), 0);
            return { ...r, load };
          })}
        />
      );
      break;
    }

    case 'projects-active': {
      title = 'Projetos em andamento';
      description = `${activeProjects.length} projetos com status "Em Andamento"`;
      openLink = { label: 'Abrir página Projetos', path: '/projects' };
      body = <ProjectsTable rows={activeProjects} />;
      break;
    }

    case 'allocations-active': {
      const todayRows = activeAllocations.filter(
        (a) => a.startDate <= today && a.endDate >= today
      );
      const futureRows = activeAllocations.filter((a) => a.startDate > today);
      title = 'Alocações vigentes';
      description = `${activeAllocations.length} alocação(ões) no horizonte (${horizonStart} → ${horizonEnd}): ${todayRows.length} ativa(s) hoje, ${futureRows.length} planejada(s) para começar mais à frente.`;
      openLink = { label: 'Abrir página Alocações', path: '/allocations' };
      body = (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Ativas hoje ({todayRows.length})</h3>
            {todayRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ativa hoje.</p>
            ) : (
              <AllocationsTable rows={todayRows} conflictIds={conflictIds} />
            )}
          </div>
          {futureRows.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                Planejadas para iniciar no horizonte ({futureRows.length})
              </h3>
              <AllocationsTable rows={futureRows} conflictIds={conflictIds} />
            </div>
          )}
        </div>
      );
      break;
    }

    case 'conflicts': {
      const rows = allocations.filter((a) => conflictIds.has(a.id));
      title = 'Conflitos de alocação';
      description = `${rows.length} alocações com sobrealocação. Mostra recurso, projeto, FTE e período de cada conflito.`;
      openLink = { label: 'Abrir página Alocações', path: '/allocations' };

      const byRes = new Map<string, Allocation[]>();
      for (const a of rows) {
        const arr = byRes.get(a.resourceId) ?? [];
        arr.push(a);
        byRes.set(a.resourceId, arr);
      }

      body = (
        <div className="space-y-6">
          {Array.from(byRes.entries()).map(([rid, list]) => {
            const r = rByName.get(rid);
            const cap = r?.capacity ?? 1;
            return (
              <div key={rid} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r?.name ?? rid}</span>
                    <Badge variant="outline">{r?.area ?? '—'}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Capacidade: {formatPercent(cap)}
                  </span>
                </div>
                <AllocationsTable rows={list} conflictIds={conflictIds} hideResource />
              </div>
            );
          })}
        </div>
      );
      break;
    }

    case 'idle-capacity': {
      const sorted = idleByResource
        .filter((x) => x.free > 0.01)
        .sort((a, b) => b.free - a.free);
      title = 'Capacidade ociosa para novas demandas';
      description = `Total: ${formatPercent(
        idleByResource.reduce((s, x) => s + x.free, 0)
      )} no horizonte de ${horizonStart} a ${horizonEnd}.`;
      body = (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Por área</h3>
            <div className="space-y-1">
              {idleByArea.map((a) => (
                <div key={a.name} className="flex items-center justify-between rounded-md border bg-card p-2 text-sm">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-primary font-semibold">{formatPercent(a.fte)} livre</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Por recurso</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead className="text-right">Capacidade</TableHead>
                  <TableHead className="text-right">FTE livre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(({ resource, free }) => (
                  <TableRow key={resource.id}>
                    <TableCell className="font-medium">{resource.name}</TableCell>
                    <TableCell>{resource.area ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(resource.skills ?? []).slice(0, 3).join(', ')}
                      {(resource.skills?.length ?? 0) > 3 && '…'}
                    </TableCell>
                    <TableCell className="text-right">{formatPercent(resource.capacity ?? 1)}</TableCell>
                    <TableCell className="text-right text-primary font-semibold">
                      {formatPercent(free)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
      break;
    }

    case 'projects-by-status': {
      const rows = projects.filter((p) => p.status === drill.status);
      title = `Projetos com status "${drill.status}"`;
      description = `${rows.length} projeto(s)`;
      openLink = { label: 'Abrir página Projetos', path: '/projects' };
      body = <ProjectsTable rows={rows} />;
      break;
    }

    case 'projects-by-priority': {
      const rows = projects.filter((p) => p.priority === drill.priority);
      title = `Projetos com prioridade "${drill.priority}"`;
      description = `${rows.length} projeto(s)`;
      openLink = { label: 'Abrir página Projetos', path: '/projects' };
      body = <ProjectsTable rows={rows} />;
      break;
    }

    case 'phase': {
      const todayIso = new Date().toISOString().slice(0, 10);
      const rows = allocations.filter(
        (a) =>
          (a.phase ?? '').trim() === drill.phase &&
          a.startDate <= todayIso &&
          a.endDate >= todayIso
      );
      const totalFte = rows.reduce((s, a) => s + (a.fte ?? 0), 0);
      title = `Fase: ${drill.phase}`;
      description = `${rows.length} alocação(ões) vigentes nesta fase · ${formatPercent(totalFte)} FTE somado`;
      openLink = { label: 'Abrir página Alocações', path: '/allocations' };
      body = <AllocationsTable rows={rows} conflictIds={conflictIds} />;
      break;
    }

    case 'weekday': {
      // Para o dia da semana selecionado, calcula a contribuição em FTE-dias
      // de cada alocação (varrendo dia a dia o intervalo dentro do horizonte).
      const hStart = new Date(horizonStart + 'T00:00:00');
      const hEnd = new Date(horizonEnd + 'T00:00:00');
      const targetIdx = drill.weekdayIdx; // 0=Seg..6=Dom

      interface Contribution {
        allocation: Allocation;
        fteDays: number;
        days: number;
      }
      const contributions: Contribution[] = [];

      for (const a of allocations) {
        const s = new Date(
          (a.startDate > horizonStart ? a.startDate : horizonStart) + 'T00:00:00'
        );
        const e = new Date(
          (a.endDate < horizonEnd ? a.endDate : horizonEnd) + 'T00:00:00'
        );
        if (s > e || s > hEnd || e < hStart) continue;
        let days = 0;
        const cur = new Date(s);
        while (cur <= e) {
          const jsDow = cur.getDay();
          const idx = jsDow === 0 ? 6 : jsDow - 1; // 0=Seg..6=Dom
          if (idx === targetIdx) days++;
          cur.setDate(cur.getDate() + 1);
        }
        if (days > 0) {
          contributions.push({
            allocation: a,
            days,
            fteDays: Number((days * (a.fte ?? 0)).toFixed(2)),
          });
        }
      }

      contributions.sort((x, y) => y.fteDays - x.fteDays);
      const totalFteDays = contributions.reduce((s, c) => s + c.fteDays, 0);

      // Top por recurso
      const byResource = new Map<string, { name: string; area: string; fteDays: number }>();
      for (const c of contributions) {
        const r = resources.find((x) => x.id === c.allocation.resourceId);
        const key = c.allocation.resourceId;
        const cur = byResource.get(key) ?? {
          name: r?.name ?? c.allocation.resourceName ?? '—',
          area: r?.area ?? '—',
          fteDays: 0,
        };
        cur.fteDays = Number((cur.fteDays + c.fteDays).toFixed(2));
        byResource.set(key, cur);
      }
      const topResources = Array.from(byResource.values())
        .sort((a, b) => b.fteDays - a.fteDays)
        .slice(0, 20);

      // Top por projeto
      const byProject = new Map<string, { name: string; fteDays: number }>();
      for (const c of contributions) {
        const key = c.allocation.projectId;
        const cur = byProject.get(key) ?? {
          name: c.allocation.projectName ?? '—',
          fteDays: 0,
        };
        cur.fteDays = Number((cur.fteDays + c.fteDays).toFixed(2));
        byProject.set(key, cur);
      }
      const topProjects = Array.from(byProject.values())
        .sort((a, b) => b.fteDays - a.fteDays)
        .slice(0, 20);

      title = `${drill.weekday}: detalhamento`;
      description = `${formatPercent(totalFteDays)} FTE-dias acumulados em ${drill.weekday} no horizonte ${horizonStart} → ${horizonEnd} · ${contributions.length} alocações contribuindo`;
      openLink = { label: 'Abrir página Alocações', path: '/allocations' };
      body = (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Top recursos contribuindo</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">FTE-dias em {drill.weekday}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topResources.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.area}</TableCell>
                    <TableCell className="text-right">{formatPercent(r.fteDays)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Top projetos contribuindo</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projeto</TableHead>
                  <TableHead className="text-right">FTE-dias em {drill.weekday}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProjects.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{formatPercent(p.fteDays)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Alocações que tocam {drill.weekday}</h3>
            <AllocationsTable
              rows={contributions.map((c) => c.allocation)}
              conflictIds={conflictIds}
            />
          </div>
        </div>
      );
      break;
    }

    case 'heatmap-cell': {
      const areaResources = resources.filter((r) => (r.area ?? 'N/A') === drill.area);
      const rels = allocations.filter(
        (a) =>
          areaResources.find((r) => r.id === a.resourceId) &&
          rangesOverlap(a.startDate, a.endDate, drill.weekStart, drill.weekEnd)
      );
      const totalCap = areaResources.reduce((s, r) => s + (r.capacity ?? 1), 0);
      const used = rels.reduce((s, a) => s + (a.fte ?? 0), 0);
      title = `${drill.area} · ${drill.weekLabel}`;
      description = `Semana ${drill.weekStart} → ${drill.weekEnd} · ${formatPercent(used)} ocupado de ${formatPercent(totalCap)} · ${rels.length} alocação(ões)`;
      body = <AllocationsTable rows={rels} conflictIds={conflictIds} />;
      break;
    }

    case 'heatmap-resource-cell': {
      const r = rByName.get(drill.resourceId);
      const rels = allocations.filter(
        (a) =>
          a.resourceId === drill.resourceId &&
          rangesOverlap(a.startDate, a.endDate, drill.weekStart, drill.weekEnd)
      );
      const cap = r?.capacity ?? 1;
      const used = rels.reduce((s, a) => s + (a.fte ?? 0), 0);
      title = `${r?.name ?? 'Recurso'} · ${drill.weekLabel}`;
      description = `${r?.area ?? '—'} · Semana ${drill.weekStart} → ${drill.weekEnd} · ${formatPercent(used)} ocupado de ${formatPercent(cap)} · ${rels.length} alocação(ões)`;
      body = <AllocationsTable rows={rels} conflictIds={conflictIds} hideResource />;
      break;
    }

    case 'skill': {
      const skillResources = resources.filter((r) => resourceHasSkill(r, drill.skill));
      const rows = skillResources.map((r) => ({
        resource: r,
        free: freeCapacity(r, allocations, horizonStart, horizonEnd),
        current: allocations
          .filter((a) => a.resourceId === r.id && a.startDate <= today && a.endDate >= today)
          .reduce((s, a) => s + (a.fte ?? 0), 0),
      }));
      rows.sort((a, b) => b.free - a.free);
      const totalFree = rows.reduce((s, x) => s + x.free, 0);
      title = `Skill: ${drill.skill}${filterByArea ? ` · Área ${dashArea}` : ''}`;
      description = `${rows.length} recurso(s)${filterByArea ? ` na área "${dashArea}"` : ' de todas as áreas'} · ${formatPercent(totalFree)} de FTE livre no horizonte`;
      body = (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recurso</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">Capacidade</TableHead>
                <TableHead className="text-right">Carga hoje</TableHead>
                <TableHead className="text-right">FTE livre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ resource: r, free, current }) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.area ?? '—'}</TableCell>
                  <TableCell className="text-right">{formatPercent(r.capacity ?? 1)}</TableCell>
                  <TableCell className="text-right">{formatPercent(current)}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">
                    {formatPercent(free)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
      break;
    }

    case 'resource': {
      const r = rByName.get(drill.resourceId);
      const rows = allocations.filter((a) => a.resourceId === drill.resourceId);
      const active = rows.filter((a) => a.startDate <= today && a.endDate >= today);
      const totalActiveFte = active.reduce((s, a) => s + (a.fte ?? 0), 0);

      title = r?.name ?? 'Recurso';
      description = r
        ? `${r.role ?? '—'} · ${r.area ?? '—'} · Capacidade ${formatPercent(r.capacity ?? 1)} · Carga atual ${formatPercent(totalActiveFte)}`
        : '';
      body = (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">
              Alocações vigentes ({active.length})
            </h3>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem alocações ativas hoje.</p>
            ) : (
              <AllocationsTable rows={active} conflictIds={conflictIds} hideResource />
            )}
          </div>
          {rows.length > active.length && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                Histórico ({rows.length - active.length})
              </h3>
              <AllocationsTable
                rows={rows.filter((a) => !active.find((x) => x.id === a.id))}
                conflictIds={conflictIds}
                hideResource
              />
            </div>
          )}
        </div>
      );
      break;
    }
  }

  return (
    <Dialog open={!!drill} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="mt-2">{body}</div>
        {openLink && (
          <div className="mt-4 flex justify-end border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                nav(openLink!.path);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              {openLink.label}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================ SUB-TABLES ============================
function ResourcesTable({
  rows,
}: {
  rows: (Resource & { load: number })[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem registros.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Área</TableHead>
            <TableHead className="text-right">Capacidade</TableHead>
            <TableHead className="text-right">Carga atual</TableHead>
            <TableHead className="text-right">Utilização</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const util = r.capacity > 0 ? r.load / r.capacity : 0;
            const over = util > 1 + 1e-9;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.role ?? '—'}</TableCell>
                <TableCell>{r.area ?? '—'}</TableCell>
                <TableCell className="text-right">{formatPercent(r.capacity ?? 1)}</TableCell>
                <TableCell className="text-right">{formatPercent(r.load)}</TableCell>
                <TableCell className="text-right">
                  <span className={over ? 'font-semibold text-destructive' : ''}>
                    {formatPercent(util)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectsTable({ rows }: { rows: Project[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem registros.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Área</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Início</TableHead>
            <TableHead>Fim</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>{p.client ?? '—'}</TableCell>
              <TableCell>{p.area ?? '—'}</TableCell>
              <TableCell>
                <Badge variant="outline" style={{ borderColor: PRIORITY_COLORS[p.priority] }}>
                  {p.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" style={{ borderColor: STATUS_COLORS[p.status] }}>
                  {p.status}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(p.startDate)}</TableCell>
              <TableCell>{formatDate(p.endDate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AllocationsTable({
  rows,
  conflictIds,
  hideResource,
}: {
  rows: Allocation[];
  conflictIds: Set<string>;
  hideResource?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem registros.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {!hideResource && <TableHead>Recurso</TableHead>}
            <TableHead>Projeto</TableHead>
            <TableHead>Fase</TableHead>
            <TableHead className="text-right">FTE</TableHead>
            <TableHead>Início</TableHead>
            <TableHead>Fim</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id} className={conflictIds.has(a.id) ? 'bg-destructive/5' : ''}>
              {!hideResource && (
                <TableCell className="font-medium">{a.resourceName ?? '—'}</TableCell>
              )}
              <TableCell>{a.projectName ?? '—'}</TableCell>
              <TableCell>{a.phase ?? '—'}</TableCell>
              <TableCell className="text-right">{formatPercent(a.fte ?? 0)}</TableCell>
              <TableCell>{formatDate(a.startDate)}</TableCell>
              <TableCell>{formatDate(a.endDate)}</TableCell>
              <TableCell>
                {conflictIds.has(a.id) ? (
                  <Badge variant="destructive">Conflito</Badge>
                ) : (
                  <Badge variant="outline">OK</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
