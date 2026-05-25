import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'manager' | 'viewer';

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  active: boolean;
  /** Área permitida. Se vazia/undefined, o usuário não tem restrição (apenas admin). */
  area?: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
  lastLogin?: Timestamp | Date | null;
}

/** Lista mestre de áreas / frentes de negócio. */
export interface Area {
  id: string;
  name: string;
  active: boolean;
  description?: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface Resource {
  id: string;
  name: string;
  role: string; // Cargo
  area: string; // Área Corporativa
  skills: string[]; // Skills Principais
  capacity: number; // 0..1 (1 = 100%)
  active?: boolean;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export type ProjectStatus = 'Planejado' | 'Em Andamento' | 'Pausado' | 'Concluído' | 'Cancelado';
export type ProjectPriority = 'Baixa' | 'Média' | 'Alta' | 'Crítica';

export interface Project {
  id: string;
  name: string;
  area: string;
  client: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  startDate: string; // ISO date yyyy-mm-dd
  endDate: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface Allocation {
  id: string;
  resourceId: string;
  resourceName?: string; // denormalizado p/ performance/listagem
  projectId: string;
  projectName?: string;
  phase: string;
  fte: number; // 0..1
  startDate: string;
  endDate: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface ImportResult {
  total: number;
  imported: number;
  rejected: number;
  errors: { row: number; reason: string }[];
}

export interface AppLog {
  id?: string;
  action: string;
  detail?: string;
  userId: string;
  userEmail: string;
  timestamp?: Timestamp | Date | null;
}

// ============================ PIPELINE ============================

export type PipelineStatus =
  | 'Prospecção'
  | 'Proposta'
  | 'Negociação'
  | 'Ganho'
  | 'Perdido';

/** Demanda de skill: skill + FTE total agregado durante toda a janela do projeto. */
export interface SkillDemand {
  skill: string;
  fte: number; // 0..N (N FTE necessários no período)
}

export interface PipelineProject {
  id: string;
  name: string;
  client: string;
  area: string;
  modules: string[]; // lista de módulos (ex: "SAP MM", "SAP FI", "Integrações")
  priority: ProjectPriority;
  status: PipelineStatus;
  probability: number; // 0..100 (chance de fechamento)
  expectedCloseDate: string; // ISO date — quando o negócio fecharia
  expectedStartDate: string; // ISO date — início da execução
  expectedEndDate: string; // ISO date — fim da execução
  skillDemand: SkillDemand[];
  notes?: string;
  /** Quando o pipeline é "Ganho", guarda o id do Project criado em /projects. */
  convertedProjectId?: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

// ============================ ANÁLISE ============================

/** Resumo de oferta/demanda para uma skill num período. */
export interface SkillBalance {
  skill: string;
  area?: string; // se filtrado por área
  demand: number; // FTE total demandado
  supply: number; // FTE total disponível
  gap: number; // demand - supply (positivo = déficit)
  resourcesWithSkill: number;
}

/** Sugestão de realocação de um recurso de um projeto para outro. */
export interface ReallocationSuggestion {
  resourceId: string;
  resourceName: string;
  fromProjectId: string;
  fromProjectName: string;
  toProjectId?: string; // pode ser projeto pipeline (sem id real ainda)
  toProjectName: string;
  skill: string;
  freeableFte: number; // quanto dá pra mover sem quebrar o projeto origem
  score: number; // 0..100 — confiança da sugestão
  reason: string; // explicação textual
}
