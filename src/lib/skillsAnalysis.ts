import type {
  Allocation,
  PipelineProject,
  Project,
  ReallocationSuggestion,
  Resource,
  SkillBalance,
} from '@/types';
import { rangesOverlap } from './utils';

// ============================ HORIZONTE ============================
export const DEFAULT_HORIZON_DAYS = 6 * 30; // ~6 meses

export function horizonRange(days = DEFAULT_HORIZON_DAYS): { start: string; end: string } {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  return {
    start: today.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// ============================ NORMALIZAÇÃO ============================
/** Match exato por nome (case-insensitive + trim). */
export function normSkill(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

export function resourceHasSkill(r: Resource, skill: string): boolean {
  const target = normSkill(skill);
  return (r.skills ?? []).some((s) => normSkill(s) === target);
}

// ============================ CAPACIDADE LIVRE ============================
/**
 * Calcula a capacidade livre (FTE) de um recurso num período.
 * Capacidade livre = capacity - sum(FTE alocações sobrepostas com [start,end]).
 */
export function freeCapacity(
  resource: Resource,
  allocations: Allocation[],
  start: string,
  end: string
): number {
  const cap = resource.capacity ?? 1;
  const overlapping = allocations.filter(
    (a) => a.resourceId === resource.id && rangesOverlap(a.startDate, a.endDate, start, end)
  );
  const used = overlapping.reduce((s, a) => s + (a.fte ?? 0), 0);
  return Math.max(0, cap - used);
}

// ============================ OFERTA POR SKILL ============================
/**
 * Para uma skill e período: soma a capacidade livre dos recursos que possuem essa skill.
 * Se area for fornecido, filtra recursos da área.
 */
export function supplyForSkill(
  skill: string,
  resources: Resource[],
  allocations: Allocation[],
  start: string,
  end: string,
  area?: string
): { supply: number; count: number; resources: Array<{ resource: Resource; free: number }> } {
  const eligible = resources.filter(
    (r) => resourceHasSkill(r, skill) && (!area || r.area === area)
  );
  const detail = eligible.map((r) => ({
    resource: r,
    free: freeCapacity(r, allocations, start, end),
  }));
  return {
    supply: detail.reduce((s, x) => s + x.free, 0),
    count: eligible.length,
    resources: detail,
  };
}

// ============================ BALANÇO PARA UM PROJETO PIPELINE ============================
/**
 * Para cada skill demandada pelo projeto pipeline, calcula a oferta dentro da área
 * e o gap (déficit/sobra). Considera o período de execução do projeto.
 */
export function pipelineSkillBalance(
  pipeline: PipelineProject,
  resources: Resource[],
  allocations: Allocation[]
): SkillBalance[] {
  const start = pipeline.expectedStartDate;
  const end = pipeline.expectedEndDate;
  return (pipeline.skillDemand ?? []).map((d) => {
    const { supply, count } = supplyForSkill(
      d.skill,
      resources,
      allocations,
      start,
      end,
      pipeline.area
    );
    return {
      skill: d.skill,
      area: pipeline.area,
      demand: d.fte,
      supply,
      gap: Number((d.fte - supply).toFixed(2)),
      resourcesWithSkill: count,
    };
  });
}

// ============================ GAPS GLOBAIS ============================
/**
 * Visão global: para cada skill demandada por algum projeto pipeline (ponderada pela
 * probabilidade de fechamento), versus a oferta da empresa no horizonte.
 *
 * useWeighted = true: multiplica demanda pela probability/100 do pipeline.
 */
export function globalSkillGaps(
  pipeline: PipelineProject[],
  resources: Resource[],
  allocations: Allocation[],
  horizonDays = DEFAULT_HORIZON_DAYS,
  useWeighted = true,
  /** Quando passado, filtra pipelines + oferta para a área. */
  area?: string
): SkillBalance[] {
  const { start, end } = horizonRange(horizonDays);

  // Agrega demanda por skill (todos os pipelines no horizonte, opcionalmente da área)
  const demandBySkill = new Map<string, { fte: number; areas: Set<string> }>();

  for (const p of pipeline) {
    if (p.status === 'Perdido') continue;
    if (area && p.area !== area) continue;
    // Considera projetos com data de execução tocando o horizonte
    if (!rangesOverlap(p.expectedStartDate, p.expectedEndDate, start, end)) continue;

    const weight = useWeighted ? Math.max(0, Math.min(100, p.probability ?? 100)) / 100 : 1;
    for (const d of p.skillDemand ?? []) {
      const key = normSkill(d.skill);
      const entry = demandBySkill.get(key) ?? { fte: 0, areas: new Set<string>() };
      entry.fte += (d.fte ?? 0) * weight;
      if (p.area) entry.areas.add(p.area);
      demandBySkill.set(key, entry);
    }
  }

  const balances: SkillBalance[] = [];
  for (const [skillKey, info] of demandBySkill) {
    // Encontra o nome "bonito" da skill (case original) pelo primeiro recurso ou pipeline
    const displayName =
      resources.flatMap((r) => r.skills ?? []).find((s) => normSkill(s) === skillKey) ??
      pipeline
        .flatMap((p) => (p.skillDemand ?? []).map((d) => d.skill))
        .find((s) => normSkill(s) === skillKey) ??
      skillKey;

    const { supply, count } = supplyForSkill(displayName, resources, allocations, start, end, area);
    balances.push({
      skill: displayName,
      area,
      demand: Number(info.fte.toFixed(2)),
      supply: Number(supply.toFixed(2)),
      gap: Number((info.fte - supply).toFixed(2)),
      resourcesWithSkill: count,
    });
  }

  return balances.sort((a, b) => b.gap - a.gap);
}

// ============================ SUGESTÃO DE REALOCAÇÃO ============================
/**
 * Para um projeto pipeline com gap numa skill, busca recursos da mesma área com a skill
 * que estão alocados em projetos de prioridade ≤ pipeline.priority e que possam liberar
 * FTE para o novo projeto.
 *
 * Heurística:
 *  - Candidato precisa ter a skill demandada
 *  - Candidato precisa ser da mesma área
 *  - Olha alocações no período do pipeline (overlap)
 *  - Pode liberar até (capacity - outras alocações fora dessa origem) FTE
 *  - Prefere alocações em projetos de prioridade mais baixa
 */
export function reallocationSuggestions(
  pipeline: PipelineProject,
  skillGap: SkillBalance,
  resources: Resource[],
  projects: Project[],
  allocations: Allocation[]
): ReallocationSuggestion[] {
  if (skillGap.gap <= 0) return [];

  const priorityWeight: Record<string, number> = {
    'Baixa': 1,
    'Média': 2,
    'Alta': 3,
    'Crítica': 4,
  };
  const targetPriority = priorityWeight[pipeline.priority] ?? 2;

  const periodStart = pipeline.expectedStartDate;
  const periodEnd = pipeline.expectedEndDate;

  // Recursos elegíveis: skill + mesma área
  const eligible = resources.filter(
    (r) => resourceHasSkill(r, skillGap.skill) && r.area === pipeline.area
  );

  const suggestions: ReallocationSuggestion[] = [];

  for (const r of eligible) {
    // Alocações desse recurso que tocam o período do pipeline
    const overlap = allocations.filter(
      (a) => a.resourceId === r.id && rangesOverlap(a.startDate, a.endDate, periodStart, periodEnd)
    );

    for (const a of overlap) {
      const fromProject = projects.find((p) => p.id === a.projectId);
      if (!fromProject) continue;

      const fromPrio = priorityWeight[fromProject.priority] ?? 2;
      // Só sugere mover se prioridade origem ≤ destino
      if (fromPrio > targetPriority) continue;

      // FTE liberável = o que está nessa alocação específica (com cap pelo gap)
      const freeableFte = Math.min(a.fte ?? 0, skillGap.gap);
      if (freeableFte <= 0.05) continue; // ignora valores irrisórios

      // Score: prioridade da origem (menor = mais score) + match skill
      const prioritySpread = targetPriority - fromPrio; // 0..3
      const score = Math.min(
        100,
        50 + prioritySpread * 12 + Math.min(40, freeableFte * 40)
      );

      const reason = [
        `Recurso possui skill "${skillGap.skill}"`,
        `está alocado em "${fromProject.name}" (prioridade ${fromProject.priority})`,
        fromPrio < targetPriority
          ? `prioridade menor que o pipeline (${pipeline.priority})`
          : 'mesma prioridade',
      ].join(' · ');

      suggestions.push({
        resourceId: r.id,
        resourceName: r.name,
        fromProjectId: fromProject.id,
        fromProjectName: fromProject.name,
        toProjectName: pipeline.name,
        skill: skillGap.skill,
        freeableFte: Number(freeableFte.toFixed(2)),
        score: Number(score.toFixed(0)),
        reason,
      });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

// ============================ RESUMO DE IMPACTO ============================
export interface PipelineImpact {
  pipeline: PipelineProject;
  balances: SkillBalance[];
  totalDemand: number;
  totalSupply: number;
  totalGap: number;
  /** Para cada skill em déficit, lista de sugestões. */
  suggestionsBySkill: Record<string, ReallocationSuggestion[]>;
  /** Quantos FTE precisam ser contratados mesmo após sugestões. */
  hireNeed: Array<{ skill: string; fte: number }>;
}

// ============================ ANÁLISE PROFUNDA POR SKILL ============================

export interface ResourceSkillStatus {
  resourceId: string;
  resourceName: string;
  area: string;
  capacity: number;
  /** FTE consumido por alocações que se sobrepõem ao horizonte. */
  currentLoad: number;
  /** Capacidade livre = capacity - currentLoad (clamped 0+). */
  freeFte: number;
  /** True se a folga é desprezível (< 5%). */
  saturated: boolean;
  /** Primeira data em que uma alocação ativa termina (libera FTE). */
  earliestRelease?: string;
  currentAllocations: Array<{
    projectId: string;
    projectName: string;
    fte: number;
    startDate: string;
    endDate: string;
    priority?: string;
  }>;
}

export interface DemandingPipelineRef {
  id: string;
  name: string;
  status: string;
  probability: number;
  /** FTE pedido pelo pipeline para esta skill. */
  fte: number;
  /** fte ponderado pela probability. */
  weighted: number;
  startDate: string;
  endDate: string;
  priority: string;
}

export interface SkillGapDeep {
  skill: string;
  area?: string;
  horizonStart: string;
  horizonEnd: string;
  totalDemand: number;
  totalSupply: number;
  gap: number;
  resourceStatus: ResourceSkillStatus[];
  demandingPipelines: DemandingPipelineRef[];
  reallocationSuggestions: ReallocationSuggestion[];
  /** FTE não coberto nem por capacidade livre nem por realocações. Indica contratação. */
  hireRecommendation: number;
}

/**
 * Análise profunda de uma skill em uma área (ou global):
 *  - Cruza pipelines da área que demandam a skill (demanda ponderada por probabilidade)
 *    com a oferta atual (capacidade livre dos recursos com a skill).
 *  - Gera status detalhado por recurso (saturado? quando libera? alocações ativas).
 *  - Sugere realocações entre projetos (consolida sugestões de todos os pipelines).
 *  - Calcula necessidade de contratação como gap remanescente após realocação.
 */
export function analyzeSkillGap(
  skill: string,
  pipeline: PipelineProject[],
  resources: Resource[],
  projects: Project[],
  allocations: Allocation[],
  horizonDays = DEFAULT_HORIZON_DAYS,
  area?: string
): SkillGapDeep {
  const { start, end } = horizonRange(horizonDays);
  const skillL = normSkill(skill);

  // 1. Pipelines demandando esta skill (na área se filtrada, e no horizonte)
  const demandingPipelines: DemandingPipelineRef[] = [];
  for (const p of pipeline) {
    if (p.status === 'Perdido') continue;
    if (area && p.area !== area) continue;
    if (!rangesOverlap(p.expectedStartDate, p.expectedEndDate, start, end)) continue;
    const sd = (p.skillDemand ?? []).find((d) => normSkill(d.skill) === skillL);
    if (!sd) continue;
    const prob = Math.max(0, Math.min(100, p.probability ?? 100)) / 100;
    demandingPipelines.push({
      id: p.id,
      name: p.name,
      status: p.status,
      probability: p.probability ?? 0,
      fte: sd.fte,
      weighted: sd.fte * prob,
      startDate: p.expectedStartDate,
      endDate: p.expectedEndDate,
      priority: p.priority,
    });
  }
  const totalDemand = Number(
    demandingPipelines.reduce((s, x) => s + x.weighted, 0).toFixed(2)
  );

  // 2. Status por recurso (na área se filtrada)
  const eligibleResources = resources.filter(
    (r) => resourceHasSkill(r, skill) && (!area || r.area === area)
  );

  const resourceStatus: ResourceSkillStatus[] = eligibleResources.map((r) => {
    const inHorizon = allocations.filter(
      (a) => a.resourceId === r.id && rangesOverlap(a.startDate, a.endDate, start, end)
    );
    const currentLoad = inHorizon.reduce((s, a) => s + (a.fte ?? 0), 0);
    const cap = r.capacity ?? 1;
    const freeFte = Math.max(0, cap - currentLoad);

    const currentAllocations = inHorizon
      .map((a) => {
        const proj = projects.find((p) => p.id === a.projectId);
        return {
          projectId: a.projectId,
          projectName: a.projectName ?? proj?.name ?? '—',
          fte: a.fte ?? 0,
          startDate: a.startDate,
          endDate: a.endDate,
          priority: proj?.priority,
        };
      })
      .sort((a, b) => a.endDate.localeCompare(b.endDate));

    return {
      resourceId: r.id,
      resourceName: r.name,
      area: r.area ?? '',
      capacity: Number(cap.toFixed(2)),
      currentLoad: Number(currentLoad.toFixed(2)),
      freeFte: Number(freeFte.toFixed(2)),
      saturated: freeFte < 0.05,
      earliestRelease: currentAllocations[0]?.endDate,
      currentAllocations,
    };
  });

  const totalSupply = Number(
    resourceStatus.reduce((s, x) => s + x.freeFte, 0).toFixed(2)
  );
  const gap = Number((totalDemand - totalSupply).toFixed(2));

  // 3. Consolida sugestões de realocação (dedupe por recurso+projeto origem)
  const allSuggestions: ReallocationSuggestion[] = [];
  for (const dp of demandingPipelines) {
    const pip = pipeline.find((p) => p.id === dp.id);
    if (!pip) continue;
    const skillBalance: SkillBalance = {
      skill,
      area,
      demand: dp.fte,
      supply: totalSupply,
      gap: Math.max(0, dp.fte - totalSupply),
      resourcesWithSkill: eligibleResources.length,
    };
    allSuggestions.push(
      ...reallocationSuggestions(pip, skillBalance, resources, projects, allocations)
    );
  }
  const seen = new Set<string>();
  const deduped = allSuggestions
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const key = `${s.resourceId}::${s.fromProjectId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const coverableByRealloc = deduped.reduce((s, x) => s + x.freeableFte, 0);
  const hireRecommendation = Math.max(
    0,
    Number((gap - coverableByRealloc).toFixed(2))
  );

  return {
    skill,
    area,
    horizonStart: start,
    horizonEnd: end,
    totalDemand,
    totalSupply,
    gap,
    resourceStatus,
    demandingPipelines,
    reallocationSuggestions: deduped,
    hireRecommendation,
  };
}

// Função de impacto pipeline (existente)
export function computePipelineImpact(
  pipeline: PipelineProject,
  resources: Resource[],
  projects: Project[],
  allocations: Allocation[]
): PipelineImpact {
  const balances = pipelineSkillBalance(pipeline, resources, allocations);
  const suggestionsBySkill: Record<string, ReallocationSuggestion[]> = {};
  const hireNeed: Array<{ skill: string; fte: number }> = [];

  for (const b of balances) {
    if (b.gap > 0) {
      const sugg = reallocationSuggestions(pipeline, b, resources, projects, allocations);
      suggestionsBySkill[b.skill] = sugg;

      // Quanto sobra de gap mesmo aplicando todas as sugestões?
      const coverable = sugg.reduce((s, x) => s + x.freeableFte, 0);
      const remaining = Math.max(0, b.gap - coverable);
      if (remaining > 0.05) {
        hireNeed.push({ skill: b.skill, fte: Number(remaining.toFixed(2)) });
      }
    }
  }

  return {
    pipeline,
    balances,
    totalDemand: Number(balances.reduce((s, b) => s + b.demand, 0).toFixed(2)),
    totalSupply: Number(balances.reduce((s, b) => s + b.supply, 0).toFixed(2)),
    totalGap: Number(balances.reduce((s, b) => s + Math.max(0, b.gap), 0).toFixed(2)),
    suggestionsBySkill,
    hireNeed,
  };
}
