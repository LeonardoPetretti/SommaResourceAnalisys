import { useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Sparkles,
  TrendingUp,
  Briefcase,
  AlertTriangle,
  Download,
  Upload,
  CheckCircle2,
  ArrowRightCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ImportDialog } from '@/components/common/ImportDialog';
import { PipelineFormDialog } from './PipelineFormDialog';
import { PipelineImpactDialog } from './PipelineImpactDialog';
import { usePipeline } from '@/hooks/usePipeline';
import { useResources } from '@/hooks/useResources';
import { useProjects } from '@/hooks/useProjects';
import { useAllocations } from '@/hooks/useAllocations';
import {
  deletePipelineProject,
  bulkCreatePipeline,
  convertPipelineToProject,
} from '@/services/pipelineService';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/useToast';
import { formatDate, formatPercent, cn } from '@/lib/utils';
import { downloadCSV, toCSV, pick } from '@/lib/csv';
import { parsePtDate } from '@/lib/utils';
import { globalSkillGaps, analyzeSkillGap } from '@/lib/skillsAnalysis';
import type { SkillGapDeep } from '@/lib/skillsAnalysis';
import type {
  PipelineProject,
  PipelineStatus,
  ProjectPriority,
  SkillDemand,
} from '@/types';

const STATUS_COLORS: Record<PipelineStatus, string> = {
  'Prospecção': '#94a3b8',
  'Proposta': '#7DD13C',
  'Negociação': '#f59e0b',
  'Ganho': '#22c55e',
  'Perdido': '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Baixa': '#94a3b8',
  'Média': '#7DD13C',
  'Alta': '#f59e0b',
  'Crítica': '#ef4444',
};

type PipelineDrill =
  | null
  | { kind: 'active' }
  | { kind: 'negotiation' }
  | { kind: 'won' }
  | { kind: 'status'; status: PipelineStatus }
  | { kind: 'priority'; priority: ProjectPriority }
  | { kind: 'area'; area: string }
  | { kind: 'gap-skill'; skill: string };

export function PipelinePage() {
  const { data: pipeline = [], isLoading } = usePipeline();
  const { data: resources = [] } = useResources();
  const { data: projects = [] } = useProjects();
  const { data: allocations = [] } = useAllocations();
  const { canManage } = useAuthStore();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PipelineProject | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);
  const [viewing, setViewing] = useState<PipelineProject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PipelineProject | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [gapsArea, setGapsArea] = useState<string>('__all__');
  const [gapsHorizon, setGapsHorizon] = useState<number>(180);
  const [drill, setDrill] = useState<PipelineDrill>(null);
  const [convertingAll, setConvertingAll] = useState(false);

  // ===== Pipelines "Ganho" ainda não convertidos em Projeto =====
  const pendingConversion = useMemo(
    () => pipeline.filter((p) => p.status === 'Ganho' && !p.convertedProjectId),
    [pipeline]
  );

  const handleConvertAll = async () => {
    if (pendingConversion.length === 0) return;
    setConvertingAll(true);
    let ok = 0;
    let fail = 0;
    for (const p of pendingConversion) {
      try {
        await convertPipelineToProject(p);
        ok++;
      } catch (e) {
        fail++;
        // eslint-disable-next-line no-console
        console.error('Falha ao converter pipeline', p.name, e);
      }
    }
    setConvertingAll(false);
    toast({
      title: 'Conversão concluída',
      description: `${ok} convertido(s) · ${fail} falha(s). Os projetos já estão em /projects.`,
      variant: fail === 0 ? 'success' : 'destructive',
    });
  };

  // ===== Export =====
  // Formato Skills: "ABAP:2; SAP FI:1.5"
  const formatSkills = (skills: SkillDemand[]) =>
    skills.map((s) => `${s.skill}:${s.fte}`).join('; ');

  const handleExport = () => {
    const rows = pipeline.map((p) => ({
      Nome: p.name,
      Cliente: p.client ?? '',
      Area: p.area ?? '',
      Modulos: (p.modules ?? []).join('; '),
      Prioridade: p.priority,
      Status: p.status,
      Probabilidade: `${p.probability}%`,
      'Data Fechamento': p.expectedCloseDate ?? '',
      'Inicio Execucao': p.expectedStartDate ?? '',
      'Fim Execucao': p.expectedEndDate ?? '',
      Skills: formatSkills(p.skillDemand ?? []),
      Notas: p.notes ?? '',
    }));
    downloadCSV(
      `pipeline_${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(rows)
    );
    toast({ title: 'CSV gerado', variant: 'success' });
  };

  // ===== Parser Skills inverso =====
  const parseSkills = (raw: string): SkillDemand[] => {
    if (!raw) return [];
    return raw
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const [skill, fteRaw] = part.split(':').map((x) => x.trim());
        const fte = Number((fteRaw || '0').replace(',', '.')) || 0;
        return { skill, fte };
      })
      .filter((d) => d.skill && d.fte > 0);
  };

  // ===== KPIs =====
  const active = pipeline.filter((p) => p.status !== 'Perdido' && p.status !== 'Ganho');
  const weightedDemand = pipeline.reduce((s, p) => {
    if (p.status === 'Perdido') return s;
    const w = (p.probability ?? 0) / 100;
    const tot = (p.skillDemand ?? []).reduce((acc, d) => acc + d.fte, 0);
    return s + tot * w;
  }, 0);
  const inNegotiation = pipeline.filter((p) => p.status === 'Negociação').length;
  const won = pipeline.filter((p) => p.status === 'Ganho').length;

  // ===== Lista filtrada =====
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return pipeline;
    return pipeline.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.client.toLowerCase().includes(s) ||
        p.area.toLowerCase().includes(s) ||
        p.modules.some((m) => m.toLowerCase().includes(s))
    );
  }, [pipeline, search]);

  // ===== Áreas disponíveis (intersecção pipeline + recursos) =====
  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const p of pipeline) if (p.area) set.add(p.area);
    for (const r of resources) if (r.area) set.add(r.area);
    return Array.from(set).sort();
  }, [pipeline, resources]);

  // ===== Gaps globais (com filtro opcional por área + horizonte configurável) =====
  const globalGaps = useMemo(() => {
    const filterArea = gapsArea === '__all__' ? undefined : gapsArea;
    return globalSkillGaps(pipeline, resources, allocations, gapsHorizon, true, filterArea);
  }, [pipeline, resources, allocations, gapsArea, gapsHorizon]);

  // ===== Diagnóstico do estado vazio =====
  const gapsDiagnostic = useMemo(() => {
    const filterArea = gapsArea === '__all__' ? undefined : gapsArea;
    const today = new Date().toISOString().slice(0, 10);
    const horizonEnd = new Date();
    horizonEnd.setDate(horizonEnd.getDate() + gapsHorizon);
    const horizonEndIso = horizonEnd.toISOString().slice(0, 10);

    const inArea = filterArea
      ? pipeline.filter((p) => p.area === filterArea)
      : pipeline;
    const notLost = inArea.filter((p) => p.status !== 'Perdido');
    const inHorizon = notLost.filter(
      (p) => p.expectedStartDate <= horizonEndIso && p.expectedEndDate >= today
    );
    const withSkills = inHorizon.filter(
      (p) => (p.skillDemand ?? []).length > 0
    );
    const resourcesInArea = filterArea
      ? resources.filter((r) => r.area === filterArea)
      : resources;
    return {
      filterArea,
      horizonStart: today,
      horizonEnd: horizonEndIso,
      totalInArea: inArea.length,
      notLost: notLost.length,
      inHorizon: inHorizon.length,
      withSkills: withSkills.length,
      resourcesInArea: resourcesInArea.length,
    };
  }, [pipeline, resources, gapsArea, gapsHorizon]);

  // ===== Dados de gráficos interativos =====
  const statusChartData = useMemo(() => {
    const m = new Map<PipelineStatus, number>();
    for (const p of pipeline) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [pipeline]);

  const priorityChartData = useMemo(() => {
    const m = new Map<ProjectPriority, number>();
    for (const p of pipeline) m.set(p.priority, (m.get(p.priority) ?? 0) + 1);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [pipeline]);

  const areaDemandData = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pipeline) {
      if (p.status === 'Perdido') continue;
      const weight = (p.probability ?? 0) / 100;
      const tot = (p.skillDemand ?? []).reduce((s, d) => s + d.fte, 0);
      m.set(p.area, (m.get(p.area) ?? 0) + tot * weight);
    }
    return Array.from(m.entries())
      .map(([name, fte]) => ({ name, fte: Number(fte.toFixed(2)) }))
      .sort((a, b) => b.fte - a.fte);
  }, [pipeline]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deletePipelineProject(confirmDelete.id);
      toast({ title: 'Removido', variant: 'success' });
    } catch (e: any) {
      toast({
        title: 'Falha ao remover',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Pipeline de Projetos"
        description="Projetos em prospecção e negociação — base para análise de impacto e contratação"
        actions={
          <>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            {canManage() && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Importar
              </Button>
            )}
            {canManage() && (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Briefcase className="h-5 w-5" />}
          label="Em pipeline (ativo)"
          value={active.length}
          hint={`${pipeline.length} no total · ${won} ganho(s) · clique para listar`}
          onClick={() => active.length > 0 && setDrill({ kind: 'active' })}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="FTE demandado (ponderado)"
          value={formatPercent(weightedDemand)}
          hint="Soma das demandas × probabilidade"
          tone="accent"
        />
        <KpiCard
          icon={<Sparkles className="h-5 w-5" />}
          label="Em negociação"
          value={inNegotiation}
          hint="Clique para listar"
          onClick={() => inNegotiation > 0 && setDrill({ kind: 'negotiation' })}
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Skills com gap global"
          value={globalGaps.filter((g) => g.gap > 0).length}
          hint="Veja na aba 'Análise de Gaps'"
          tone={globalGaps.some((g) => g.gap > 0) ? 'warning' : 'default'}
        />
      </div>

      {/* Banner: pipelines Ganho ainda não convertidos em Projeto */}
      {canManage() && pendingConversion.length > 0 && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ArrowRightCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">
                  {pendingConversion.length} pipeline(s) com status "Ganho" ainda não
                  vinculado(s) a Projeto
                </p>
                <p className="text-xs text-muted-foreground">
                  Clique no botão para criar/vincular os Projetos correspondentes. Eles
                  aparecerão imediatamente em Projetos e no dropdown de Alocações.
                </p>
              </div>
            </div>
            <Button onClick={handleConvertAll} disabled={convertingAll}>
              {convertingAll ? 'Convertendo...' : 'Converter todos agora'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Gráficos interativos */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline por Status</CardTitle>
            <CardDescription>Clique numa fatia para detalhar</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {statusChartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    label
                    onClick={(d: any) =>
                      d?.name && setDrill({ kind: 'status', status: d.name })
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {statusChartData.map((entry, i) => (
                      <Cell
                        key={`pst-${i}`}
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
            <CardTitle>Pipeline por Prioridade</CardTitle>
            <CardDescription>Clique numa barra para detalhar</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {priorityChartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    onClick={(d: any) =>
                      d?.name && setDrill({ kind: 'priority', priority: d.name })
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {priorityChartData.map((entry, i) => (
                      <Cell
                        key={`ppr-${i}`}
                        fill={PRIORITY_COLORS[entry.name] ?? '#888'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>FTE ponderado por área</CardTitle>
            <CardDescription>Clique numa barra para detalhar</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {areaDemandData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaDemandData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip />
                  <Bar
                    dataKey="fte"
                    fill="hsl(var(--primary))"
                    onClick={(d: any) =>
                      d?.name && setDrill({ kind: 'area', area: d.name })
                    }
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="gaps">Análise de Gaps (Global)</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, cliente, área, módulo..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="text-sm text-muted-foreground">
                {filtered.length} projeto(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Módulos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead className="text-right">Prob.</TableHead>
                    <TableHead className="text-right">Demanda</TableHead>
                    <TableHead>Fechamento</TableHead>
                    <TableHead>Execução</TableHead>
                    <TableHead className="w-32 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    [...Array(4)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={11}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}

                  {!isLoading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                        Nenhum projeto no pipeline. Clique em "Novo" para começar.
                      </TableCell>
                    </TableRow>
                  )}

                  {filtered.map((p) => {
                    const totalDemand = (p.skillDemand ?? []).reduce((s, d) => s + d.fte, 0);
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => {
                          setViewing(p);
                          setImpactOpen(true);
                        }}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {p.convertedProjectId && (
                              <span
                                title="Vinculado a Projeto"
                                className="text-primary"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{p.client || '—'}</TableCell>
                        <TableCell>{p.area}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="flex flex-wrap gap-1">
                            {p.modules.slice(0, 3).map((m, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {m}
                              </Badge>
                            ))}
                            {p.modules.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{p.modules.length - 3}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            style={{ borderColor: STATUS_COLORS[p.status] }}
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            style={{ borderColor: PRIORITY_COLORS[p.priority] }}
                          >
                            {p.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{p.probability}%</TableCell>
                        <TableCell className="text-right">
                          {formatPercent(totalDemand)}
                        </TableCell>
                        <TableCell>{formatDate(p.expectedCloseDate)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(p.expectedStartDate)} → {formatDate(p.expectedEndDate)}
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Ver impacto"
                              onClick={() => {
                                setViewing(p);
                                setImpactOpen(true);
                              }}
                            >
                              <Sparkles className="h-4 w-4 text-primary" />
                            </Button>
                            {canManage() &&
                              p.status === 'Ganho' &&
                              !p.convertedProjectId && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Criar Projeto a partir deste Pipeline"
                                  onClick={async () => {
                                    try {
                                      await convertPipelineToProject(p);
                                      toast({
                                        title: 'Projeto criado',
                                        description: `"${p.name}" disponível em Projetos.`,
                                        variant: 'success',
                                      });
                                    } catch (e: any) {
                                      toast({
                                        title: 'Falha ao criar Projeto',
                                        description: e?.message ?? 'Tente novamente',
                                        variant: 'destructive',
                                      });
                                    }
                                  }}
                                >
                                  <ArrowRightCircle className="h-4 w-4 text-primary" />
                                </Button>
                              )}
                            {canManage() && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Editar"
                                onClick={() => {
                                  setEditing(p);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canManage() && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Excluir"
                                onClick={() => setConfirmDelete(p)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="gaps">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle>
                    Análise de Gaps {gapsArea === '__all__' ? 'Global' : `· ${gapsArea}`}{' '}
                    · próximos {gapsHorizon} dias
                  </CardTitle>
                  <CardDescription>
                    <strong>Demanda ponderada</strong> = Σ (FTE do pipeline × probabilidade), considerando
                    pipelines com janela de execução tocando o horizonte. <strong>Oferta</strong> = Σ
                    capacidade livre (capacity − alocações em curso) dos recursos com a skill na área.
                    <strong> Gap</strong> = demanda − oferta. Positivo indica déficit (contratar ou
                    rebalancear).
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Horizonte:</span>
                    <Select
                      value={String(gapsHorizon)}
                      onValueChange={(v) => setGapsHorizon(Number(v))}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">1 semana (7d)</SelectItem>
                        <SelectItem value="15">15 dias</SelectItem>
                        <SelectItem value="30">30 dias</SelectItem>
                        <SelectItem value="60">60 dias</SelectItem>
                        <SelectItem value="90">90 dias</SelectItem>
                        <SelectItem value="120">120 dias</SelectItem>
                        <SelectItem value="150">150 dias</SelectItem>
                        <SelectItem value="180">180 dias (6m)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Área:</span>
                    <Select value={gapsArea} onValueChange={setGapsArea}>
                      <SelectTrigger className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas (visão global)</SelectItem>
                        {areas.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {globalGaps.length === 0 ? (
                <GapsEmptyState diagnostic={gapsDiagnostic} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Skill</TableHead>
                      <TableHead className="text-right">Demanda ponderada</TableHead>
                      <TableHead className="text-right">Oferta disponível</TableHead>
                      <TableHead className="text-right">Gap</TableHead>
                      <TableHead>Cobertura</TableHead>
                      <TableHead className="text-right">Recursos</TableHead>
                      <TableHead>Indicação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {globalGaps.map((g) => {
                      const coverage = g.demand > 0 ? Math.min(100, (g.supply / g.demand) * 100) : 100;
                      const needsHire = g.gap > 0;
                      return (
                        <TableRow
                          key={g.skill}
                          className="cursor-pointer hover:bg-accent/40"
                          onClick={() => setDrill({ kind: 'gap-skill', skill: g.skill })}
                        >
                          <TableCell className="font-medium">{g.skill}</TableCell>
                          <TableCell className="text-right">{formatPercent(g.demand)}</TableCell>
                          <TableCell className="text-right">{formatPercent(g.supply)}</TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-semibold',
                              needsHire ? 'text-destructive' : 'text-primary'
                            )}
                          >
                            {needsHire ? formatPercent(g.gap) : 'OK'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={coverage} className="h-1.5 w-32" />
                              <span className="text-xs text-muted-foreground">
                                {Math.round(coverage)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{g.resourcesWithSkill}</TableCell>
                          <TableCell>
                            {needsHire ? (
                              <Badge variant="destructive">
                                Avaliar contratação ({formatPercent(g.gap)})
                              </Badge>
                            ) : (
                              <Badge variant="outline">Capacidade ok</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PipelineFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        pipeline={editing}
      />

      <PipelineImpactDialog
        open={impactOpen}
        onOpenChange={setImpactOpen}
        pipeline={viewing}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Excluir projeto do pipeline?"
        description={`"${confirmDelete?.name ?? ''}" será removido permanentemente.`}
        destructive
        confirmText="Excluir"
        onConfirm={handleDelete}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Pipeline"
        templateHint={
          'Colunas: Nome; Cliente; Area; Modulos; Prioridade; Status; Probabilidade; ' +
          'Data Fechamento; Inicio Execucao; Fim Execucao; Skills; Notas. ' +
          'Skills no formato "ABAP:2; SAP FI:1.5".'
        }
        templateColumns={[
          'Nome',
          'Cliente',
          'Area',
          'Modulos',
          'Prioridade',
          'Status',
          'Probabilidade',
          'Data Fechamento',
          'Inicio Execucao',
          'Fim Execucao',
          'Skills',
          'Notas',
        ]}
        templateExample={{
          Nome: 'ACME - SAP S/4 Wave 2',
          Cliente: 'ACME Ltda',
          Area: 'SAP',
          Modulos: 'SAP MM; SAP FI; Integrações',
          Prioridade: 'Alta',
          Status: 'Negociação',
          Probabilidade: '70%',
          'Data Fechamento': '30/06/2026',
          'Inicio Execucao': '01/08/2026',
          'Fim Execucao': '31/03/2027',
          Skills: 'ABAP:2; SAP FI:1.5; SAP MM:1',
          Notas: 'Aguardando aprovação do CFO',
        }}
        templateFilename="template_pipeline"
        parseRow={(row, idx) => {
          const name = pick(row, 'Nome', 'name');
          if (!name) return { __error: `Linha ${idx}: nome vazio` };
          const area = pick(row, 'Area', 'Área');
          if (!area) return { __error: `Linha ${idx}: área vazia` };

          const closeDate = parsePtDate(pick(row, 'Data Fechamento', 'expectedCloseDate'));
          const startDate = parsePtDate(pick(row, 'Inicio Execucao', 'Início Execução', 'expectedStartDate'));
          const endDate = parsePtDate(pick(row, 'Fim Execucao', 'Fim Execução', 'expectedEndDate'));
          if (!startDate || !endDate) return { __error: `Linha ${idx}: datas de execução inválidas` };

          const probRaw = pick(row, 'Probabilidade', 'probability');
          const prob = Number((probRaw || '0').replace('%', '').replace(',', '.')) || 0;

          const modules = pick(row, 'Modulos', 'Módulos')
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean);

          const skillDemand = parseSkills(pick(row, 'Skills', 'Demanda Skills'));

          return {
            name,
            client: pick(row, 'Cliente', 'client'),
            area,
            modules,
            priority: (pick(row, 'Prioridade') || 'Média') as ProjectPriority,
            status: (pick(row, 'Status') || 'Prospecção') as PipelineStatus,
            probability: Math.max(0, Math.min(100, prob)),
            expectedCloseDate: closeDate || startDate,
            expectedStartDate: startDate,
            expectedEndDate: endDate,
            skillDemand,
            notes: pick(row, 'Notas', 'notes'),
          };
        }}
        bulkCreate={(items) => bulkCreatePipeline(items as any)}
      />

      <PipelineDrillDialog
        drill={drill}
        onOpenChange={(v) => !v && setDrill(null)}
        pipeline={pipeline}
        resources={resources}
        projects={projects}
        allocations={allocations}
        gapsArea={gapsArea}
        gapsHorizon={gapsHorizon}
        onOpenPipeline={(p) => {
          setDrill(null);
          setViewing(p);
          setImpactOpen(true);
        }}
      />
    </div>
  );
}

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

interface GapsDiagnostic {
  filterArea?: string;
  horizonStart: string;
  horizonEnd: string;
  totalInArea: number;
  notLost: number;
  inHorizon: number;
  withSkills: number;
  resourcesInArea: number;
}

function GapsEmptyState({ diagnostic }: { diagnostic: GapsDiagnostic }) {
  const {
    filterArea,
    horizonStart,
    horizonEnd,
    totalInArea,
    notLost,
    inHorizon,
    withSkills,
    resourcesInArea,
  } = diagnostic;

  // Identifica a causa mais provável
  let cause = '';
  if (totalInArea === 0) {
    cause = filterArea
      ? `Não há pipelines com área "${filterArea}". Cadastre pipelines com esta área ou ajuste o filtro.`
      : 'Não há pipelines cadastrados ainda.';
  } else if (notLost === 0) {
    cause = `Todos os pipelines da área estão como "Perdido". Eles são ignorados na análise.`;
  } else if (inHorizon === 0) {
    cause = `Nenhum pipeline da área tem execução tocando ${horizonStart} → ${horizonEnd}. Aumente o horizonte ou ajuste as datas de execução dos pipelines.`;
  } else if (withSkills === 0) {
    cause = `Os pipelines no horizonte não têm skills cadastradas na demanda. Edite-os e adicione skills na seção "Demanda de skills".`;
  } else {
    cause =
      'Os pipelines têm skills mas o cálculo retornou vazio. Verifique se as skills demandadas existem em algum recurso cadastrado.';
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/30 p-4">
      <p className="text-sm font-medium">Sem gaps para exibir.</p>
      <p className="text-sm text-muted-foreground">{cause}</p>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
        <DiagnosticStat label="Pipelines na área" value={totalInArea} />
        <DiagnosticStat label="Não perdidos" value={notLost} />
        <DiagnosticStat label="No horizonte" value={inHorizon} />
        <DiagnosticStat label="Com skills" value={withSkills} />
        <DiagnosticStat label="Recursos na área" value={resourcesInArea} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Horizonte considerado: {horizonStart} → {horizonEnd}
      </p>
    </div>
  );
}

function DiagnosticStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-background p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

// ============================ SKILL GAP DEEP ANALYSIS BODY ============================
function SkillGapAnalysisBody({
  deep,
  onOpenPipeline,
}: {
  deep: SkillGapDeep;
  onOpenPipeline: (pipelineId: string) => void;
}) {
  const saturated = deep.resourceStatus.filter((r) => r.saturated);
  const withFree = deep.resourceStatus
    .filter((r) => !r.saturated)
    .sort((a, b) => b.freeFte - a.freeFte);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <MiniStat label="Demanda ponderada" value={formatPercent(deep.totalDemand)} />
        <MiniStat label="Oferta livre" value={formatPercent(deep.totalSupply)} tone="accent" />
        <MiniStat
          label="Gap"
          value={deep.gap > 0 ? formatPercent(deep.gap) : 'OK'}
          tone={deep.gap > 0 ? 'warning' : 'default'}
        />
        <MiniStat
          label="Contratação"
          value={deep.hireRecommendation > 0 ? formatPercent(deep.hireRecommendation) : '—'}
          tone={deep.hireRecommendation > 0 ? 'warning' : 'default'}
          hint={
            deep.hireRecommendation > 0
              ? 'Gap remanescente mesmo após rebalanceamento sugerido'
              : 'Cobertura possível com rebalanceamento'
          }
        />
      </div>

      {/* Resumo textual */}
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        {deep.gap <= 0 ? (
          <p>
            <strong>Capacidade ok.</strong> A oferta livre desta skill na área cobre toda a
            demanda ponderada do pipeline. Margem de {formatPercent(-deep.gap)} disponível.
          </p>
        ) : deep.hireRecommendation === 0 ? (
          <p>
            <strong>Gap coberto via rebalanceamento.</strong> Existe déficit de{' '}
            {formatPercent(deep.gap)} entre demanda e capacidade livre, mas é possível liberar
            esse FTE remanejando recursos de projetos de prioridade menor. Veja sugestões abaixo.
          </p>
        ) : (
          <p>
            <strong>Necessária contratação.</strong> Mesmo aplicando todas as sugestões de
            rebalanceamento, restam{' '}
            <span className="text-destructive font-semibold">
              {formatPercent(deep.hireRecommendation)}
            </span>{' '}
            de FTE descobertos para a skill <em>{deep.skill}</em>.
          </p>
        )}
      </div>

      {/* Recursos saturados (não podem assumir novos projetos antes de liberar) */}
      {saturated.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-destructive">
            🚫 Recursos saturados ({saturated.length}) — não podem assumir novos projetos
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Estes recursos da área já estão com 100%+ da capacidade alocada no horizonte.
            Mostra também a data em que cada alocação ativa termina.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead className="text-right">Capacidade</TableHead>
                  <TableHead className="text-right">Carga atual</TableHead>
                  <TableHead>Primeira liberação</TableHead>
                  <TableHead>Alocações ativas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saturated.map((r) => (
                  <TableRow key={r.resourceId} className="bg-destructive/5">
                    <TableCell className="font-medium">{r.resourceName}</TableCell>
                    <TableCell className="text-right">{formatPercent(r.capacity)}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">
                      {formatPercent(r.currentLoad)}
                    </TableCell>
                    <TableCell>
                      {r.earliestRelease ? formatDate(r.earliestRelease) : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.currentAllocations.length === 0
                        ? '—'
                        : r.currentAllocations.map((a, i) => (
                            <div key={i} className="text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {a.projectName}
                              </span>{' '}
                              · {formatPercent(a.fte)} · até {formatDate(a.endDate)}
                              {a.priority && (
                                <span className="ml-1 text-[10px]">[{a.priority}]</span>
                              )}
                            </div>
                          ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Recursos com folga */}
      {withFree.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-primary">
            ✅ Recursos com capacidade livre ({withFree.length})
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead className="text-right">Capacidade</TableHead>
                  <TableHead className="text-right">Carga atual</TableHead>
                  <TableHead className="text-right">FTE livre</TableHead>
                  <TableHead>Próxima liberação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withFree.map((r) => (
                  <TableRow key={r.resourceId}>
                    <TableCell className="font-medium">{r.resourceName}</TableCell>
                    <TableCell className="text-right">{formatPercent(r.capacity)}</TableCell>
                    <TableCell className="text-right">{formatPercent(r.currentLoad)}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatPercent(r.freeFte)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.earliestRelease ? formatDate(r.earliestRelease) : 'Já disponível'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Sugestões de rebalanceamento */}
      {deep.reallocationSuggestions.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">🔁 Sugestões de rebalanceamento</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Recursos da mesma área que poderiam ser realocados de projetos de menor prioridade
            para atender à demanda do pipeline.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead>Sair de</TableHead>
                  <TableHead className="text-right">FTE liberável</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Para projetos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deep.reallocationSuggestions.map((s, i) => (
                  <TableRow key={`${s.resourceId}-${i}`}>
                    <TableCell className="font-medium">{s.resourceName}</TableCell>
                    <TableCell className="text-sm">{s.fromProjectName}</TableCell>
                    <TableCell className="text-right text-primary font-semibold">
                      {formatPercent(s.freeableFte)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          s.score >= 70 ? 'default' : s.score >= 50 ? 'outline' : 'secondary'
                        }
                      >
                        {s.score}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {deep.demandingPipelines.slice(0, 2).map((p) => p.name).join(', ')}
                      {deep.demandingPipelines.length > 2 &&
                        ` +${deep.demandingPipelines.length - 2}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Necessidade de contratação */}
      {deep.hireRecommendation > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-destructive">
            👥 Necessidade de contratação
          </h3>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">
              Avaliar contratação de profissional(is) com skill{' '}
              <strong>{deep.skill}</strong>
              {deep.area ? ` para a área ${deep.area}` : ''}.
            </p>
            <p className="mt-1 text-muted-foreground">
              Volume estimado: <strong>{formatPercent(deep.hireRecommendation)}</strong> FTE.
              Esse valor representa o déficit remanescente mesmo após aplicar todas as
              {' '}
              {deep.reallocationSuggestions.length} sugestão(ões) de rebalanceamento listadas
              acima.
            </p>
          </div>
        </section>
      )}

      {/* Pipelines demandando */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">📋 Pipelines demandando esta skill</h3>
        {deep.demandingPipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pipeline demanda esta skill no horizonte.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Prob.</TableHead>
                <TableHead className="text-right">Demanda</TableHead>
                <TableHead className="text-right">Ponderada</TableHead>
                <TableHead>Execução</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deep.demandingPipelines.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => onOpenPipeline(p.id)}
                >
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{p.probability}%</TableCell>
                  <TableCell className="text-right">{formatPercent(p.fte)}</TableCell>
                  <TableCell className="text-right">{formatPercent(p.weighted)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(p.startDate)} → {formatDate(p.endDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'accent';
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-xl font-bold',
            tone === 'warning' && 'text-destructive',
            tone === 'accent' && 'text-primary'
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ============================ DRILL DIALOG ============================
function PipelineDrillDialog({
  drill,
  onOpenChange,
  pipeline,
  resources,
  projects,
  allocations,
  gapsArea,
  gapsHorizon,
  onOpenPipeline,
}: {
  drill: PipelineDrill;
  onOpenChange: (v: boolean) => void;
  pipeline: PipelineProject[];
  resources: any[];
  projects: any[];
  allocations: any[];
  gapsArea: string;
  gapsHorizon: number;
  onOpenPipeline: (p: PipelineProject) => void;
}) {
  if (!drill) return null;

  let title = '';
  let description = '';
  let body: React.ReactNode = null;

  const today = new Date().toISOString().slice(0, 10);

  const renderPipelineRows = (rows: PipelineProject[]) => {
    if (rows.length === 0) {
      return <p className="text-sm text-muted-foreground">Sem registros.</p>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Área</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead className="text-right">Prob.</TableHead>
            <TableHead className="text-right">Demanda</TableHead>
            <TableHead>Fechamento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const totalDemand = (p.skillDemand ?? []).reduce((s, d) => s + d.fte, 0);
            return (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-accent/40"
                onClick={() => onOpenPipeline(p)}
              >
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.client || '—'}</TableCell>
                <TableCell>{p.area}</TableCell>
                <TableCell>
                  <Badge variant="outline" style={{ borderColor: STATUS_COLORS[p.status] }}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" style={{ borderColor: PRIORITY_COLORS[p.priority] }}>
                    {p.priority}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{p.probability}%</TableCell>
                <TableCell className="text-right">{formatPercent(totalDemand)}</TableCell>
                <TableCell>{formatDate(p.expectedCloseDate)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  switch (drill.kind) {
    case 'active': {
      const rows = pipeline.filter((p) => p.status !== 'Ganho' && p.status !== 'Perdido');
      title = 'Pipelines ativos';
      description = `${rows.length} no funil (Prospecção, Proposta, Negociação)`;
      body = renderPipelineRows(rows);
      break;
    }
    case 'negotiation': {
      const rows = pipeline.filter((p) => p.status === 'Negociação');
      title = 'Em negociação';
      description = `${rows.length} pipeline(s) com status "Negociação"`;
      body = renderPipelineRows(rows);
      break;
    }
    case 'won': {
      const rows = pipeline.filter((p) => p.status === 'Ganho');
      title = 'Ganhos';
      description = `${rows.length} pipeline(s) ganho(s) — devem aparecer também em Projetos`;
      body = renderPipelineRows(rows);
      break;
    }
    case 'status': {
      const rows = pipeline.filter((p) => p.status === drill.status);
      title = `Status: ${drill.status}`;
      description = `${rows.length} pipeline(s)`;
      body = renderPipelineRows(rows);
      break;
    }
    case 'priority': {
      const rows = pipeline.filter((p) => p.priority === drill.priority);
      title = `Prioridade: ${drill.priority}`;
      description = `${rows.length} pipeline(s)`;
      body = renderPipelineRows(rows);
      break;
    }
    case 'area': {
      const rows = pipeline.filter((p) => p.area === drill.area);
      title = `Área: ${drill.area}`;
      description = `${rows.length} pipeline(s) nesta frente`;
      body = renderPipelineRows(rows);
      break;
    }
    case 'gap-skill': {
      const filterArea = gapsArea === '__all__' ? undefined : gapsArea;
      const deep: SkillGapDeep = analyzeSkillGap(
        drill.skill,
        pipeline,
        resources,
        projects,
        allocations,
        gapsHorizon,
        filterArea
      );
      title = `Skill: ${drill.skill}`;
      description = `${filterArea ? `Área "${filterArea}" · ` : ''}${deep.resourceStatus.length} recurso(s) · ${deep.demandingPipelines.length} pipeline(s) demandando · horizonte ${deep.horizonStart} → ${deep.horizonEnd}`;
      body = <SkillGapAnalysisBody deep={deep} onOpenPipeline={(id) => {
        const p = pipeline.find((x) => x.id === id);
        if (p) onOpenPipeline(p);
      }} />;
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
      </DialogContent>
    </Dialog>
  );
}
