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
import type { Project, ProjectPriority, ProjectStatus } from '@/types';

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
    }
  }, [open, project, areaLocked, authUser?.area]);

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
      const payload = {
        name: name.trim(),
        area: area.trim(),
        client: client.trim(),
        priority,
        status,
        startDate,
        endDate,
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
                <Label>Data Início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Data Fim</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
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
