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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/useToast';
import { createResource, updateResource } from '@/services/resourcesService';
import { useActiveAreaNames } from '@/hooks/useAreas';
import { useAuthStore } from '@/store/authStore';
import type { Resource } from '@/types';
import { parsePercent, formatPercent } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resource?: Resource | null;
}

export function ResourceFormDialog({ open, onOpenChange, resource }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [area, setArea] = useState('');
  const [skills, setSkills] = useState('');
  const [capacity, setCapacity] = useState('100%');
  const [saving, setSaving] = useState(false);

  const areaNames = useActiveAreaNames();
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  // Se o usuário tem área associada e não é admin, pré-fixa e trava o campo
  const areaLocked = !isAdmin() && !!authUser?.area;

  useEffect(() => {
    if (open) {
      setName(resource?.name ?? '');
      setRole(resource?.role ?? '');
      // Pré-fixa com a área do usuário ao criar (se restringido) ou usa a do recurso
      const defaultArea =
        resource?.area ?? (areaLocked ? authUser?.area ?? '' : '');
      setArea(defaultArea);
      setSkills((resource?.skills ?? []).join(', '));
      setCapacity(resource ? formatPercent(resource.capacity ?? 1) : '100%');
    }
  }, [open, resource, areaLocked, authUser?.area]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        role: role.trim(),
        area: area.trim(),
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        capacity: parsePercent(capacity),
        active: true,
      };
      if (resource) {
        await updateResource(resource.id, payload);
        toast({ title: 'Recurso atualizado', variant: 'success' });
      } else {
        await createResource(payload);
        toast({ title: 'Recurso criado', variant: 'success' });
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
            <DialogTitle>{resource ? 'Editar Recurso' : 'Novo Recurso'}</DialogTitle>
            <DialogDescription>Cadastro de consultor / colaborador</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-3">
            <div>
              <Label>Nome Completo *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cargo</Label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
              <div>
                <Label>Área Corporativa</Label>
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
                {areaLocked && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Você só pode cadastrar recursos na sua área ({authUser?.area}).
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label>Skills Principais (separadas por vírgula)</Label>
              <Textarea
                rows={2}
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="React, Node.js, AWS"
              />
            </div>
            <div>
              <Label>Capacity (ex.: 100%, 0.75)</Label>
              <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
