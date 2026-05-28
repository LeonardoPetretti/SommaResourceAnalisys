import { useEffect, useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/useToast';
import { createAllocation, updateAllocation } from '@/services/allocationsService';
import { useResources } from '@/hooks/useResources';
import { useProjects } from '@/hooks/useProjects';
import { useAllocations } from '@/hooks/useAllocations';
import { parsePercent, formatPercent, rangesOverlap } from '@/lib/utils';
import type { Allocation } from '@/types';
import { PROJECT_PHASES } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allocation?: Allocation | null;
}

export function AllocationFormDialog({ open, onOpenChange, allocation }: Props) {
  const { data: resources = [] } = useResources();
  const { data: projects = [] } = useProjects();
  const { data: allocations = [] } = useAllocations();

  const [resourceId, setResourceId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [phase, setPhase] = useState('');
  const [fte, setFte] = useState('100%');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setResourceId(allocation?.resourceId ?? '');
      setProjectId(allocation?.projectId ?? '');
      setPhase(allocation?.phase ?? '');
      setFte(allocation ? formatPercent(allocation.fte ?? 1) : '100%');
      setStartDate(allocation?.startDate ?? '');
      setEndDate(allocation?.endDate ?? '');
    }
  }, [open, allocation]);

  // Detecção de conflitos: total de FTE > capacity
  const conflict = useMemo(() => {
    if (!resourceId || !startDate || !endDate) return null;
    const res = resources.find((r) => r.id === resourceId);
    if (!res) return null;
    const fteNum = parsePercent(fte);
    let totalOverlap = 0;
    for (const a of allocations) {
      if (allocation && a.id === allocation.id) continue;
      if (a.resourceId !== resourceId) continue;
      if (rangesOverlap(startDate, endDate, a.startDate, a.endDate)) {
        totalOverlap += a.fte;
      }
    }
    const total = totalOverlap + fteNum;
    if (total > (res.capacity ?? 1) + 0.0001) {
      return { total, capacity: res.capacity ?? 1, overlap: totalOverlap, fte: fteNum };
    }
    return null;
  }, [resourceId, startDate, endDate, fte, allocations, allocation, resources]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceId || !projectId) {
      toast({ title: 'Recurso e projeto são obrigatórios', variant: 'destructive' });
      return;
    }
    if (!startDate || !endDate) {
      toast({ title: 'Datas obrigatórias', variant: 'destructive' });
      return;
    }
    if (startDate > endDate) {
      toast({ title: 'Data fim anterior à início', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = resources.find((r) => r.id === resourceId);
      const prj = projects.find((p) => p.id === projectId);
      const payload = {
        resourceId,
        resourceName: res?.name ?? '',
        projectId,
        projectName: prj?.name ?? '',
        phase: phase.trim(),
        fte: parsePercent(fte),
        startDate,
        endDate,
      };
      if (allocation) {
        await updateAllocation(allocation.id, payload);
        toast({ title: 'Alocação atualizada', variant: 'success' });
      } else {
        await createAllocation(payload);
        toast({ title: 'Alocação criada', variant: 'success' });
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
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{allocation ? 'Editar Alocação' : 'Nova Alocação'}</DialogTitle>
            <DialogDescription>Vínculo entre recurso e projeto com FTE</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Recurso *</Label>
                <Select value={resourceId} onValueChange={setResourceId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Projeto *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fase</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a fase..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_PHASES.map((ph) => (
                      <SelectItem key={ph} value={ph}>
                        {ph}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>FTE</Label>
                <Input value={fte} onChange={(e) => setFte(e.target.value)} placeholder="ex.: 50% ou 0.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início *</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
            </div>

            {conflict && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Conflito de alocação</Badge>
                  <span className="text-sm">
                    FTE total no período ({formatPercent(conflict.total)}) excede capacity ({formatPercent(conflict.capacity)})
                  </span>
                </div>
              </div>
            )}
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
