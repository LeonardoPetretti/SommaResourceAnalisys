import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/useToast';
import { createProject, updateProject } from '@/services/projectsService';
import { useActiveAreaNames } from '@/hooks/useAreas';
import { useAuthStore } from '@/store/authStore';
import type { Project, ProjectPriority, ProjectStatus, ProjectPhasePlan } from '@/types';
import { PROJECT_PHASES } from '@/types';

const STATUSES: ProjectStatus[] = ['Planejado', 'Em Andamento', 'Pausado', 'Concluído', 'Cancelado'];
const PRIORITIES: ProjectPriority[] = ['Baixa', 'Média', 'Alta', 'Crítica'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: Project | null;
}

export function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [client, setClient] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('Média');
  const [status, setStatus] = useState<ProjectStatus>('Planejado');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [phases, setPhases] = useState<ProjectPhasePlan[]>([]);
  const [saving, setSaving] = useState(false);

  const areaNames = useActiveAreaNames();
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const areaLocked = !isAdmin() && !!authUser?.area;

  useEffect(() => {
    if (open) {
      setName(project?.name ?? '');
      setArea(project?.area ?? (areaLocked ? authUser?.area ?? '' : ''));
      setClient(project?.client ?? '');
      setPriority(project?.priority ?? 'Média');
      setStatus(project?.status ?? 'Planejado');
      setStartDate(project?.startDate ?? '');
      setEndDate(project?.endDate ?? '');
      setPhases(project?.phases ?? []);
    }
  }, [open, project, areaLocked, authUser?.area]);

  const addPhase = (phase: string) => {
    if (!phase || phases.some((p) => p.phase === phase)) return;
    setPhases([...phases, { phase, startDate: '', endDate: '' }]);
  };

  const updatePhase = (idx: number, patch: Partial<ProjectPhasePlan>) => {
    setPhases((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const removePhase = (idx: number) => {
    setPhases((prev) => prev.filter((_, i) => i !== idx));
  };

  const availablePhases = PROJECT_PHASES.filter(
    (ph) => !phases.some((p) => p.phase === ph)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast({ title: 'Data fim anterior à início', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Valida cada fase: datas obrigatórias, ano entre 2000-2100, fim ≥ início
      const invalidPhases: string[] = [];
      const validPhases = phases
        .map((p) => ({
          phase: p.phase,
          startDate: p.startDate || '',
          endDate: p.endDate || '',
        }))
        .filter((p) => {
          if (!p.startDate || !p.endDate) {
            invalidPhases.push(`${p.phase}: data início ou fim em branco`);
            return false;
          }
          const yS = Number(p.startDate.slice(0, 4));
          const yE = Number(p.endDate.slice(0, 4));
          if (yS < 2000 || yS > 2100 || yE < 2000 || yE > 2100) {
            invalidPhases.push(
              `${p.phase}: ano fora do intervalo 2000-2100 (verifique typo, ex: '0226' vs '2026')`
            );
            return false;
          }
          if (p.endDate < p.startDate) {
            invalidPhases.push(`${p.phase}: fim (${p.endDate}) anterior ao início (${p.startDate})`);
            return false;
          }
          return true;
        });

      if (invalidPhases.length > 0) {
        toast({
          title: 'Fases com dados inválidos',
          description: invalidPhases.join(' · '),
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      const payload = {
        name: name.trim(),
        area: area.trim(),
        client: client.trim(),
        priority,
        status,
        startDate,
        endDate,
        phases: validPhases,
      };
      if (project) {
        await updateProject(project.id, payload);
        toast({ title: 'Projeto atualizado', variant: 'success' });
      } else {
        await createProject(payload);
        toast({ title: 'Projeto criado', variant: 'success' });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: String(err?.message ?? err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{project ? 'Editar Projeto' : 'Novo Projeto'}</DialogTitle>
            <DialogDescription>Cadastro de projeto</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Área</Label>
                <Select value={area} onValueChange={setArea} disabled={areaLocked}>
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
              </div>
              <div>
                <Label>Cliente</Label>
                <Input value={client} onChange={(e) => setClient(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as ProjectPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início (geral do projeto)</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Data Fim (geral do projeto)</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* Cronograma por fase */}
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Cronograma por fase</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Defina início/fim de cada fase do ciclo (Design → Hipercare). Opcional. Usado no Timeline.
                  </p>
                </div>
                {availablePhases.length > 0 && (
                  <Select value="" onValueChange={(v) => v && addPhase(v)}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="+ Adicionar fase" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePhases.map((ph) => (
                        <SelectItem key={ph} value={ph}>
                          {ph}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {phases.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Nenhuma fase adicionada.
                </p>
              ) : (
                <div className="space-y-2">
                  {phases.map((p, i) => (
                    <div
                      key={p.phase}
                      className="grid grid-cols-1 items-end gap-2 rounded-md bg-background p-2 sm:grid-cols-[120px_1fr_1fr_auto]"
                    >
                      <div className="font-medium text-sm">{p.phase}</div>
                      <div>
                        <Label className="text-[10px]">Início</Label>
                        <Input
                          type="date"
                          value={p.startDate}
                          onChange={(e) => updatePhase(i, { startDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Fim</Label>
                        <Input
                          type="date"
                          value={p.endDate}
                          onChange={(e) => updatePhase(i, { endDate: e.target.value })}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removePhase(i)}
                        title="Remover fase"
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
