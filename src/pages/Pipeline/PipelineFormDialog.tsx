import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  createPipelineProject,
  updatePipelineProject,
  convertPipelineToProject,
} from '@/services/pipelineService';
import { useResources } from '@/hooks/useResources';
import { useProjects } from '@/hooks/useProjects';
import { useActiveAreaNames } from '@/hooks/useAreas';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/useToast';
import { uniq } from '@/lib/utils';
import type {
  PipelineProject,
  PipelineStatus,
  ProjectPriority,
  SkillDemand,
} from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipeline: PipelineProject | null;
}

const STATUS_OPTIONS: PipelineStatus[] = [
  'Prospecção',
  'Proposta',
  'Negociação',
  'Ganho',
  'Perdido',
];

const PRIORITY_OPTIONS: ProjectPriority[] = ['Baixa', 'Média', 'Alta', 'Crítica'];

function emptyForm(): Omit<PipelineProject, 'id'> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: '',
    client: '',
    area: '',
    modules: [],
    priority: 'Média',
    status: 'Prospecção',
    probability: 50,
    expectedCloseDate: today,
    expectedStartDate: today,
    expectedEndDate: today,
    skillDemand: [],
    notes: '',
  };
}

export function PipelineFormDialog({ open, onOpenChange, pipeline }: Props) {
  const { data: resources = [] } = useResources();
  const { data: projects = [] } = useProjects();
  const [form, setForm] = useState<Omit<PipelineProject, 'id'>>(emptyForm());
  const [modulesInput, setModulesInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (pipeline) {
        const { id: _id, ...rest } = pipeline;
        setForm({ ...emptyForm(), ...rest });
        setModulesInput((pipeline.modules ?? []).join('; '));
      } else {
        setForm(emptyForm());
        setModulesInput('');
      }
    }
  }, [open, pipeline]);

  // Lista mestre de áreas + skills cadastrados
  const areaNames = useActiveAreaNames();
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const areaLocked = !isAdmin() && !!authUser?.area;
  // Pré-fixa área do usuário ao criar (se restringido)
  useEffect(() => {
    if (open && !pipeline && areaLocked && authUser?.area) {
      setForm((f) => ({ ...f, area: authUser.area! }));
    }
  }, [open, pipeline, areaLocked, authUser?.area]);
  const availableSkills = uniq(resources.flatMap((r) => r.skills ?? [])).filter(Boolean);

  const addSkillRow = () =>
    setForm((f) => ({ ...f, skillDemand: [...f.skillDemand, { skill: '', fte: 1 }] }));

  const updateSkillRow = (i: number, patch: Partial<SkillDemand>) =>
    setForm((f) => {
      const next = [...f.skillDemand];
      next[i] = { ...next[i], ...patch };
      return { ...f, skillDemand: next };
    });

  const removeSkillRow = (i: number) =>
    setForm((f) => ({ ...f, skillDemand: f.skillDemand.filter((_, idx) => idx !== i) }));

  /**
   * Replica módulos como skills demand: para cada módulo que ainda não exista na lista
   * de skills (match case-insensitive), adiciona com FTE=1. Não remove skills existentes.
   */
  const syncModulesToSkills = (raw?: string) => {
    const source = raw ?? modulesInput;
    const modules = source
      .split(/[;,]/)
      .map((m) => m.trim())
      .filter(Boolean);
    if (modules.length === 0) return;

    setForm((f) => {
      const existing = new Set(f.skillDemand.map((d) => d.skill.trim().toLowerCase()));
      const toAdd: SkillDemand[] = [];
      for (const m of modules) {
        if (!existing.has(m.toLowerCase())) {
          toAdd.push({ skill: m, fte: 1 });
          existing.add(m.toLowerCase());
        }
      }
      if (toAdd.length === 0) return f;
      return { ...f, skillDemand: [...f.skillDemand, ...toAdd] };
    });
  };

  const handleSubmit = async () => {
    // Validações simples
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (!form.area.trim()) {
      toast({ title: 'Área obrigatória', variant: 'destructive' });
      return;
    }
    if (form.expectedStartDate > form.expectedEndDate) {
      toast({
        title: 'Datas inválidas',
        description: 'Início da execução deve ser anterior ao fim.',
        variant: 'destructive',
      });
      return;
    }

    const modules = modulesInput
      .split(/[;,]/)
      .map((m) => m.trim())
      .filter(Boolean);

    // Sincroniza módulos como skills demand antes de salvar — caso o usuário
    // tenha digitado módulos e clicado direto em Salvar sem sair do campo.
    const skillDemandMerged: SkillDemand[] = [...form.skillDemand];
    const existingSkillNames = new Set(
      skillDemandMerged.map((d) => d.skill.trim().toLowerCase())
    );
    for (const m of modules) {
      if (!existingSkillNames.has(m.toLowerCase())) {
        skillDemandMerged.push({ skill: m, fte: 1 });
        existingSkillNames.add(m.toLowerCase());
      }
    }

    const skillDemand = skillDemandMerged
      .map((d) => ({ skill: d.skill.trim(), fte: Number(d.fte) || 0 }))
      .filter((d) => d.skill && d.fte > 0);

    setSaving(true);
    try {
      const payload = { ...form, modules, skillDemand };
      let savedId: string;
      if (pipeline) {
        await updatePipelineProject(pipeline.id, payload);
        savedId = pipeline.id;
        toast({ title: 'Pipeline atualizado', variant: 'success' });
      } else {
        savedId = await createPipelineProject(payload);
        toast({ title: 'Pipeline criado', variant: 'success' });
      }

      // 🔄 Auto-conversão: se status = "Ganho" e ainda não convertido, cria/vincula Project
      const alreadyConverted = pipeline?.convertedProjectId;
      if (payload.status === 'Ganho' && !alreadyConverted) {
        try {
          await convertPipelineToProject({ ...payload, id: savedId } as any);
          toast({
            title: 'Projeto criado a partir do pipeline',
            description: `"${payload.name}" agora está disponível em Projetos e Alocações.`,
            variant: 'success',
          });
        } catch (e: any) {
          toast({
            title: 'Pipeline salvo, mas falhou ao criar Projeto',
            description: e?.message ?? 'Você pode tentar novamente abrindo o pipeline.',
            variant: 'destructive',
          });
        }
      }

      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Falha ao salvar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pipeline ? 'Editar projeto do Pipeline' : 'Novo projeto no Pipeline'}</DialogTitle>
          <DialogDescription>
            Cadastre projetos em prospecção/negociação com módulos, área, data prevista e demanda de skills.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome do projeto *">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: ABC Indústria - Wave 2"
            />
          </Field>

          <Field label="Cliente">
            <Input
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              placeholder="Razão social ou apelido"
            />
          </Field>

          <Field label="Área *">
            <Select
              value={form.area}
              onValueChange={(v) => setForm({ ...form, area: v })}
              disabled={areaLocked}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma área" />
              </SelectTrigger>
              <SelectContent>
                {areaNames.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    Nenhuma área cadastrada — vá em Configurações
                  </SelectItem>
                )}
                {areaNames.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Prioridade">
            <Select
              value={form.priority}
              onValueChange={(v) => setForm({ ...form, priority: v as ProjectPriority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Status do pipeline">
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as PipelineStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={`Probabilidade de fechar (%) — ${form.probability}%`}>
            <Input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.probability}
              onChange={(e) =>
                setForm({ ...form, probability: Number(e.target.value) || 0 })
              }
            />
          </Field>

          <Field label="Data prevista de fechamento (negócio)">
            <Input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
            />
          </Field>

          <Field label="Início da execução">
            <Input
              type="date"
              value={form.expectedStartDate}
              onChange={(e) => setForm({ ...form, expectedStartDate: e.target.value })}
            />
          </Field>

          <Field label="Fim da execução">
            <Input
              type="date"
              value={form.expectedEndDate}
              onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })}
            />
          </Field>

          <Field label="Módulos (separados por ';' ou ',')" className="md:col-span-2">
            <Input
              value={modulesInput}
              onChange={(e) => setModulesInput(e.target.value)}
              onBlur={() => syncModulesToSkills()}
              placeholder="Ex: SAP MM; SAP FI; Integrações; BTP"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Ao sair do campo, cada módulo será replicado automaticamente em "Demanda de skills"
              com FTE = 1 (se ainda não existir).
            </p>
            {modulesInput && (
              <div className="mt-2 flex flex-wrap gap-1">
                {modulesInput
                  .split(/[;,]/)
                  .map((m) => m.trim())
                  .filter(Boolean)
                  .map((m, i) => (
                    <Badge key={i} variant="outline">
                      {m}
                    </Badge>
                  ))}
              </div>
            )}
          </Field>
        </div>

        {/* Demanda de skills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Demanda de skills</Label>
            <div className="flex gap-2">
              {modulesInput.trim() && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => syncModulesToSkills()}
                  title="Cria uma entrada de skill (FTE=1) para cada módulo que ainda não está na lista"
                >
                  Sincronizar dos módulos
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={addSkillRow}>
                <Plus className="h-4 w-4" />
                Adicionar skill
              </Button>
            </div>
          </div>
          {form.skillDemand.length === 0 && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Nenhuma skill cadastrada. As análises de gap e sugestões dependem dessas entradas.
            </p>
          )}
          {form.skillDemand.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-2 md:grid-cols-[1fr_120px_40px]"
            >
              <Input
                placeholder="Skill (ex: ABAP)"
                value={row.skill}
                onChange={(e) => updateSkillRow(i, { skill: e.target.value })}
                list="pipeline-skills"
              />
              <Input
                type="number"
                step="0.1"
                min={0}
                placeholder="FTE"
                value={row.fte}
                onChange={(e) => updateSkillRow(i, { fte: Number(e.target.value) || 0 })}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeSkillRow(i)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <datalist id="pipeline-skills">
            {availableSkills.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <Field label="Notas">
          <Textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            placeholder="Observações sobre o pipeline, contatos, próximos passos..."
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : pipeline ? 'Salvar alterações' : 'Criar pipeline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
