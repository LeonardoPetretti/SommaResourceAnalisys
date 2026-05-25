import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Briefcase,
  UserPlus,
  ArrowRightLeft,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useResources } from '@/hooks/useResources';
import { useProjects } from '@/hooks/useProjects';
import { useAllocations } from '@/hooks/useAllocations';
import { computePipelineImpact } from '@/lib/skillsAnalysis';
import { formatDate, formatPercent, cn } from '@/lib/utils';
import type { PipelineProject } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipeline: PipelineProject | null;
}

export function PipelineImpactDialog({ open, onOpenChange, pipeline }: Props) {
  const { data: resources = [] } = useResources();
  const { data: projects = [] } = useProjects();
  const { data: allocations = [] } = useAllocations();

  const impact = useMemo(() => {
    if (!pipeline) return null;
    return computePipelineImpact(pipeline, resources, projects, allocations);
  }, [pipeline, resources, projects, allocations]);

  if (!pipeline || !impact) return null;

  const probabilityWeighted = (pipeline.probability ?? 100) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Impacto: {pipeline.name}
          </DialogTitle>
          <DialogDescription>
            {pipeline.client} · {pipeline.area} · {pipeline.status} · probabilidade {pipeline.probability}% · fechamento previsto {formatDate(pipeline.expectedCloseDate)} · execução {formatDate(pipeline.expectedStartDate)} → {formatDate(pipeline.expectedEndDate)}
          </DialogDescription>
        </DialogHeader>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Stat
            icon={<Briefcase className="h-4 w-4" />}
            label="Demanda total"
            value={formatPercent(impact.totalDemand)}
            sub={`Ponderada: ${formatPercent(impact.totalDemand * probabilityWeighted)}`}
          />
          <Stat
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Oferta disponível"
            value={formatPercent(impact.totalSupply)}
            sub={`Na área "${pipeline.area}" durante o período`}
            tone="accent"
          />
          <Stat
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Gap total"
            value={formatPercent(impact.totalGap)}
            sub={impact.totalGap > 0 ? 'Déficit a cobrir' : 'Sem déficit'}
            tone={impact.totalGap > 0 ? 'warning' : 'default'}
          />
          <Stat
            icon={<UserPlus className="h-4 w-4" />}
            label="Necessidade de contratar"
            value={
              impact.hireNeed.length > 0
                ? formatPercent(impact.hireNeed.reduce((s, h) => s + h.fte, 0))
                : '—'
            }
            sub={
              impact.hireNeed.length > 0
                ? `${impact.hireNeed.length} skill(s) com déficit estrutural`
                : 'Cobertura possível com realocação'
            }
            tone={impact.hireNeed.length > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Balanço por skill */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Balanço por skill</h3>
          {impact.balances.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Este pipeline não tem skills cadastradas. Edite-o e adicione a demanda para gerar
              análises.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Skill</TableHead>
                  <TableHead className="text-right">Demanda</TableHead>
                  <TableHead className="text-right">Oferta na área</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead className="text-right">Recursos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {impact.balances.map((b) => {
                  const coverage = b.demand > 0 ? Math.min(100, (b.supply / b.demand) * 100) : 100;
                  const ok = b.gap <= 0;
                  return (
                    <TableRow key={b.skill}>
                      <TableCell className="font-medium">{b.skill}</TableCell>
                      <TableCell className="text-right">{formatPercent(b.demand)}</TableCell>
                      <TableCell className="text-right">{formatPercent(b.supply)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right',
                          b.gap > 0 ? 'font-semibold text-destructive' : 'text-primary'
                        )}
                      >
                        {b.gap > 0 ? formatPercent(b.gap) : 'OK'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={coverage} className="h-1.5 w-32" />
                          <span className="text-xs text-muted-foreground">
                            {Math.round(coverage)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={ok ? 'outline' : 'destructive'}>
                          {b.resourcesWithSkill}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>

        {/* Sugestões de realocação */}
        {Object.keys(impact.suggestionsBySkill).length > 0 && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              Sugestões de rebalanceamento (mesma área)
            </h3>

            {Object.entries(impact.suggestionsBySkill).map(([skill, suggestions]) => {
              if (suggestions.length === 0) {
                return (
                  <div key={skill} className="rounded-md border bg-muted/30 p-3">
                    <p className="text-sm">
                      <span className="font-semibold">{skill}</span>:{' '}
                      <span className="text-muted-foreground">
                        Nenhum recurso da área "{pipeline.area}" disponível para rebalanceamento.
                      </span>
                    </p>
                  </div>
                );
              }
              return (
                <div key={skill} className="space-y-2">
                  <p className="text-sm font-medium">
                    Para suprir <span className="text-primary">{skill}</span>:
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recurso</TableHead>
                        <TableHead>Sair de</TableHead>
                        <TableHead className="text-right">FTE liberável</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead>Justificativa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestions.map((s, i) => (
                        <TableRow key={`${s.resourceId}-${i}`}>
                          <TableCell className="font-medium">{s.resourceName}</TableCell>
                          <TableCell>{s.fromProjectName}</TableCell>
                          <TableCell className="text-right text-primary font-semibold">
                            {formatPercent(s.freeableFte)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                s.score >= 70
                                  ? 'default'
                                  : s.score >= 50
                                  ? 'outline'
                                  : 'secondary'
                              }
                            >
                              {s.score}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </section>
        )}

        {/* Necessidade de contratação */}
        {impact.hireNeed.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <UserPlus className="h-4 w-4 text-destructive" />
              Skills com déficit estrutural (avaliar contratação)
            </h3>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Skill</TableHead>
                      <TableHead className="text-right">FTE faltante</TableHead>
                      <TableHead>Recomendação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {impact.hireNeed.map((h) => (
                      <TableRow key={h.skill}>
                        <TableCell className="font-medium">{h.skill}</TableCell>
                        <TableCell className="text-right text-destructive font-semibold">
                          {formatPercent(h.fte)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          Mesmo aplicando todas as sugestões de realocação, restam{' '}
                          {formatPercent(h.fte)} a cobrir. Avaliar contratação de profissional com
                          skill <strong>{h.skill}</strong>.
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Modules */}
        {pipeline.modules.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Módulos previstos</h3>
            <div className="flex flex-wrap gap-1">
              {pipeline.modules.map((m, i) => (
                <Badge key={i} variant="outline">
                  {m}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Notas */}
        {pipeline.notes && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Notas</h3>
            <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {pipeline.notes}
            </p>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'warning' | 'accent';
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <p
          className={cn(
            'mt-1 text-xl font-bold',
            tone === 'warning' && 'text-destructive',
            tone === 'accent' && 'text-primary'
          )}
        >
          {value}
        </p>
        {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
