import { useState, useRef } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Shield, Database, Info, ShieldAlert, MapPin, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useUsers } from '@/hooks/useUsers';
import { useAreas } from '@/hooks/useAreas';
import { useSkills } from '@/hooks/useSkills';
import { useResources } from '@/hooks/useResources';
import {
  createSkill,
  updateSkill,
  deleteSkill,
  importExistingSkills,
  deduplicateSkills,
} from '@/services/skillsService';
import { updateUserActive, updateUserRole, updateUserArea } from '@/services/usersService';
import {
  createArea,
  updateArea,
  deleteArea,
  importExistingAreas,
  deduplicateAreas,
} from '@/services/areasService';
import { bulkDeleteCollection } from '@/services/bulkDeleteService';
import {
  countAreaOccurrences,
  renameArea,
  listAllAreas,
} from '@/services/adminService';
import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { AppUser, UserRole } from '@/types';

export function SettingsPage() {
  const { isAdmin } = useAuthStore();

  if (!isAdmin()) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configurações" description="Painel administrativo" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Acesso restrito</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Apenas administradores podem acessar as configurações do sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Administração do sistema" />

      <div className="flex gap-2 border-b">
        <SettingsTab to="" icon={<Shield className="h-4 w-4" />} label="Usuários" end />
        <SettingsTab to="areas" icon={<MapPin className="h-4 w-4" />} label="Áreas" />
        <SettingsTab to="skills" icon={<Sparkles className="h-4 w-4" />} label="Skills" />
        <SettingsTab to="data" icon={<Database className="h-4 w-4" />} label="Dados" />
        <SettingsTab to="about" icon={<Info className="h-4 w-4" />} label="Sobre" />
      </div>

      <Routes>
        <Route index element={<UsersSection />} />
        <Route path="areas" element={<AreasSection />} />
        <Route path="skills" element={<SkillsSection />} />
        <Route path="data" element={<DataSection />} />
        <Route path="about" element={<AboutSection />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
    </div>
  );
}

function SettingsTab({
  to,
  label,
  icon,
  end,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

// ============================ USERS ============================
function UsersSection() {
  const { data: users = [], isLoading } = useUsers();
  const { data: areas = [] } = useAreas();
  const me = useAuthStore((s) => s.user);

  const handleRoleChange = async (u: AppUser, role: UserRole) => {
    try {
      await updateUserRole(u.uid, role);
      toast({ title: 'Função atualizada', description: `${u.name}: ${role}` });
    } catch (e: any) {
      toast({
        title: 'Falha ao atualizar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const handleActiveToggle = async (u: AppUser, active: boolean) => {
    try {
      await updateUserActive(u.uid, active);
      toast({
        title: active ? 'Usuário ativado' : 'Usuário desativado',
        description: u.email,
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao atualizar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const handleAreaChange = async (u: AppUser, area: string) => {
    const value = area === '__all__' ? '' : area;
    try {
      await updateUserArea(u.uid, value);
      toast({
        title: 'Área permitida atualizada',
        description: value
          ? `${u.name}: ${value}`
          : `${u.name}: sem restrição (visão global)`,
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao atualizar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuários e permissões</CardTitle>
        <CardDescription>
          Defina papéis (admin, manager, viewer) e habilite/desabilite contas.
          <br />
          <span className="text-xs">
            <Badge variant="outline" className="mr-1">admin</Badge> total
            <Badge variant="outline" className="mx-1">manager</Badge> edita recursos/projetos/alocações
            <Badge variant="outline" className="ml-1">viewer</Badge> só leitura
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Área permitida</TableHead>
                  <TableHead>Ativo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isMe = me?.uid === u.uid;
                  const isAdminRole = u.role === 'admin';
                  return (
                    <TableRow key={u.uid}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            {u.photoURL && <AvatarImage src={u.photoURL} alt={u.name} />}
                            <AvatarFallback>{u.name?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {u.name} {isMe && <span className="text-xs text-muted-foreground">(você)</span>}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          disabled={isMe}
                          onValueChange={(v) => handleRoleChange(u, v as UserRole)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="manager">manager</SelectItem>
                            <SelectItem value="viewer">viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {isAdminRole ? (
                          <span className="text-xs text-muted-foreground italic">
                            Visão global (admin)
                          </span>
                        ) : (
                          <Select
                            value={u.area || '__all__'}
                            onValueChange={(v) => handleAreaChange(u, v)}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">
                                Todas (sem restrição)
                              </SelectItem>
                              {areas
                                .filter((a) => a.active)
                                .map((a) => (
                                  <SelectItem key={a.id} value={a.name}>
                                    {a.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={!!u.active}
                          disabled={isMe}
                          onCheckedChange={(v) => handleActiveToggle(u, v)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================ AREAS ============================
function AreasSection() {
  const { data: areas = [], isLoading } = useAreas();
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const autoImportRanRef = useRef(false);
  const [inferredNames, setInferredNames] = useState<string[]>([]);

  // Detecta duplicatas no estado atual (case-insensitive)
  const duplicateGroups = (() => {
    const counts = new Map<string, number>();
    for (const a of areas) {
      const k = a.name.trim().toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let dupCount = 0;
    for (const n of counts.values()) if (n > 1) dupCount += n - 1;
    return dupCount;
  })();

  const handleDedupe = async () => {
    setDeduping(true);
    try {
      const res = await deduplicateAreas();
      if (res.removed === 0) {
        toast({ title: 'Sem duplicatas', description: 'Nada para remover.' });
      } else {
        toast({
          title: 'Duplicatas removidas',
          description: `${res.removed} registro(s) duplicado(s) excluído(s).`,
          variant: 'success',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Falha ao deduplicar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setDeduping(false);
    }
  };

  // Lê todas as áreas inferidas dos cadastros (sob demanda)
  const loadInferred = async () => {
    try {
      const list = await listAllAreas();
      setInferredNames(list);
      return list;
    } catch {
      return [] as string[];
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const list = inferredNames.length > 0 ? inferredNames : await loadInferred();
      const created = await importExistingAreas(list);
      if (created.length === 0) {
        toast({
          title: 'Nada a importar',
          description: 'Todas as áreas usadas nos cadastros já estão cadastradas aqui.',
        });
      } else {
        toast({
          title: 'Áreas importadas',
          description: `${created.length} área(s) criada(s): ${created.join(', ')}`,
          variant: 'success',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Falha ao importar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  // Auto-importa uma vez ao entrar na aba se /areas estiver vazio mas houver áreas inferidas.
  // Usa useRef para sobreviver ao "double-fire" do StrictMode no dev.
  useEffect(() => {
    if (autoImportRanRef.current || isLoading) return;
    if (areas.length > 0) {
      autoImportRanRef.current = true;
      return;
    }
    autoImportRanRef.current = true;
    (async () => {
      const list = await loadInferred();
      if (list.length === 0) return;
      try {
        const created = await importExistingAreas(list);
        if (created.length > 0) {
          toast({
            title: 'Áreas importadas dos cadastros',
            description: `${created.length} área(s) criada(s) automaticamente. Você pode editar abaixo.`,
            variant: 'success',
          });
        }
      } catch {
        /* silencioso — usuário pode tentar manualmente */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, areas.length]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (areas.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: 'Área já existe', description: name, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await createArea(name, newDescription.trim());
      toast({ title: 'Área criada', description: name, variant: 'success' });
      setNewName('');
      setNewDescription('');
    } catch (e: any) {
      toast({
        title: 'Falha ao criar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateArea(id, { name });
      toast({ title: 'Área renomeada', variant: 'success' });
      setEditingId(null);
      setEditingName('');
    } catch (e: any) {
      toast({
        title: 'Falha ao renomear',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await updateArea(id, { active });
      toast({
        title: active ? 'Área ativada' : 'Área desativada',
        variant: 'success',
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao atualizar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteArea(confirmDelete.id);
      toast({ title: 'Área excluída', variant: 'success' });
    } catch (e: any) {
      toast({
        title: 'Falha ao excluir',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Cadastro de Áreas</CardTitle>
              <CardDescription>
                Esta lista alimenta os dropdowns de "Área" e "Área Corporativa" em Recursos,
                Projetos e Pipeline. Cadastre aqui as frentes de negócio da empresa (ex:
                Consultoria, Tecnologia, RH, Comercial).
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {duplicateGroups > 0 && (
                <Button
                  variant="default"
                  onClick={handleDedupe}
                  disabled={deduping}
                  title={`Foram detectadas ${duplicateGroups} entrada(s) duplicada(s).`}
                >
                  {deduping
                    ? 'Limpando...'
                    : `Remover ${duplicateGroups} duplicata(s)`}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleImport}
                disabled={importing}
                title="Cria entradas para áreas que já aparecem em Recursos, Projetos ou Pipeline mas ainda não estão cadastradas aqui"
              >
                {importing ? 'Importando...' : 'Importar áreas existentes'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Form de criação */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <div>
              <Label className="mb-1 block text-xs">Nome *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Consultoria"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Descrição</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} disabled={busy || !newName.trim()}>
                <Plus className="h-4 w-4" />
                {busy ? 'Criando...' : 'Adicionar'}
              </Button>
            </div>
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : areas.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma área cadastrada ainda. Adicione a primeira acima para começar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Ativa</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {areas.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {editingId === a.id ? (
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(a.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          a.name
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={!!a.active}
                          onCheckedChange={(v) => handleToggleActive(a.id, v)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {editingId === a.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleRename(a.id)}
                              >
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Renomear"
                                onClick={() => {
                                  setEditingId(a.id);
                                  setEditingName(a.name);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Excluir"
                                onClick={() =>
                                  setConfirmDelete({ id: a.id, name: a.name })
                                }
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title={`Excluir área "${confirmDelete?.name ?? ''}"?`}
        description="Atenção: registros já cadastrados com esta área não serão alterados. Considere apenas desativá-la (toggle 'Ativa') se quiser preservar histórico."
        destructive
        confirmText="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ============================ SKILLS ============================
function SkillsSection() {
  const { data: skills = [], isLoading } = useSkills();
  const { data: resources = [] } = useResources();
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const autoImportRanRef = useRef(false);

  // Skills inferidas dos recursos (todas as skills usadas)
  const inferredFromResources = (() => {
    const set = new Set<string>();
    for (const r of resources) for (const s of r.skills ?? []) if (s) set.add(s);
    return Array.from(set).sort();
  })();

  // Duplicatas
  const duplicateGroups = (() => {
    const counts = new Map<string, number>();
    for (const s of skills) {
      const k = s.name.trim().toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let dup = 0;
    for (const n of counts.values()) if (n > 1) dup += n - 1;
    return dup;
  })();

  const handleDedupe = async () => {
    setDeduping(true);
    try {
      const res = await deduplicateSkills();
      toast({
        title: res.removed === 0 ? 'Sem duplicatas' : 'Duplicatas removidas',
        description:
          res.removed === 0
            ? 'Nada para remover.'
            : `${res.removed} registro(s) duplicado(s) excluído(s).`,
        variant: res.removed === 0 ? undefined : 'success',
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao deduplicar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setDeduping(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const created = await importExistingSkills(inferredFromResources);
      toast({
        title: created.length === 0 ? 'Nada a importar' : 'Skills importadas',
        description:
          created.length === 0
            ? 'Todas as skills usadas nos recursos já estão cadastradas.'
            : `${created.length} skill(s) criada(s): ${created.join(', ')}`,
        variant: created.length === 0 ? undefined : 'success',
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao importar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  // Auto-import na 1ª carga
  useEffect(() => {
    if (autoImportRanRef.current || isLoading) return;
    if (skills.length > 0) {
      autoImportRanRef.current = true;
      return;
    }
    autoImportRanRef.current = true;
    (async () => {
      if (inferredFromResources.length === 0) return;
      try {
        const created = await importExistingSkills(inferredFromResources);
        if (created.length > 0) {
          toast({
            title: 'Skills importadas dos recursos',
            description: `${created.length} skill(s) criada(s) automaticamente.`,
            variant: 'success',
          });
        }
      } catch {
        /* silencioso */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, skills.length, inferredFromResources.length]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: 'Skill já existe', description: name, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await createSkill(name, newCategory.trim());
      toast({ title: 'Skill criada', description: name, variant: 'success' });
      setNewName('');
      setNewCategory('');
    } catch (e: any) {
      toast({
        title: 'Falha ao criar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateSkill(id, { name });
      toast({ title: 'Skill renomeada', variant: 'success' });
      setEditingId(null);
      setEditingName('');
    } catch (e: any) {
      toast({
        title: 'Falha ao renomear',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await updateSkill(id, { active });
      toast({
        title: active ? 'Skill ativada' : 'Skill desativada',
        variant: 'success',
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao atualizar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteSkill(confirmDelete.id);
      toast({ title: 'Skill excluída', variant: 'success' });
    } catch (e: any) {
      toast({
        title: 'Falha ao excluir',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Cadastro de Skills</CardTitle>
              <CardDescription>
                Lista mestre de skills usada no cadastro de Recursos e no Pipeline. Mantenha
                aqui a taxonomia padronizada (ex: ABAP, SAP FI, SAP MM, React, AWS).
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {duplicateGroups > 0 && (
                <Button
                  variant="default"
                  onClick={handleDedupe}
                  disabled={deduping}
                  title={`${duplicateGroups} duplicata(s) detectada(s)`}
                >
                  {deduping ? 'Limpando...' : `Remover ${duplicateGroups} duplicata(s)`}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleImport}
                disabled={importing}
                title="Cria entradas para skills que já aparecem nos recursos mas não estão cadastradas aqui"
              >
                {importing ? 'Importando...' : 'Importar skills existentes'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Form */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto]">
            <div>
              <Label className="mb-1 block text-xs">Nome *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: ABAP"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Categoria (opcional)</Label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Ex: SAP"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} disabled={busy || !newName.trim()}>
                <Plus className="h-4 w-4" />
                {busy ? 'Criando...' : 'Adicionar'}
              </Button>
            </div>
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : skills.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma skill cadastrada ainda. Adicione a primeira acima para começar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Ativa</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skills.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {editingId === s.id ? (
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(s.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          s.name
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.category || '—'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={!!s.active}
                          onCheckedChange={(v) => handleToggleActive(s.id, v)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {editingId === s.id ? (
                            <>
                              <Button size="sm" variant="default" onClick={() => handleRename(s.id)}>
                                Salvar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Renomear"
                                onClick={() => {
                                  setEditingId(s.id);
                                  setEditingName(s.name);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Excluir"
                                onClick={() => setConfirmDelete({ id: s.id, name: s.name })}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title={`Excluir skill "${confirmDelete?.name ?? ''}"?`}
        description="Recursos já cadastrados com esta skill mantêm o valor textual mesmo após exclusão."
        destructive
        confirmText="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ============================ DATA ============================
function DataSection() {
  const [confirm, setConfirm] = useState<null | {
    collection: 'resources' | 'projects' | 'allocations';
    label: string;
  }>(null);
  const [busy, setBusy] = useState(false);

  const handleBulkDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const deleted = await bulkDeleteCollection(confirm.collection);
      toast({
        title: 'Exclusão concluída',
        description: `${deleted} registros removidos de ${confirm.label}.`,
      });
    } catch (e: any) {
      toast({
        title: 'Falha na exclusão',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      <RenameAreaCard />

      <Card>
        <CardHeader>
          <CardTitle>Operações de dados</CardTitle>
          <CardDescription>
            Limpeza em massa. Use com cuidado — estas ações são irreversíveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DangerRow
            title="Excluir todos os Recursos"
            description="Remove a coleção 'resources' inteira."
            onClick={() => setConfirm({ collection: 'resources', label: 'Recursos' })}
          />
          <DangerRow
            title="Excluir todos os Projetos"
            description="Remove a coleção 'projects' inteira."
            onClick={() => setConfirm({ collection: 'projects', label: 'Projetos' })}
          />
          <DangerRow
            title="Excluir todas as Alocações"
            description="Remove a coleção 'allocations' inteira."
            onClick={() => setConfirm({ collection: 'allocations', label: 'Alocações' })}
          />
        </CardContent>

        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(v) => !v && setConfirm(null)}
          title={`Excluir ${confirm?.label ?? ''}?`}
          description="Esta operação não pode ser desfeita."
          confirmText={busy ? 'Excluindo...' : 'Excluir tudo'}
          destructive
          onConfirm={handleBulkDelete}
        />
      </Card>
    </div>
  );
}

// ============================ RENAME AREA ============================
function RenameAreaCard() {
  const [areas, setAreas] = useState<string[]>([]);
  const [fromArea, setFromArea] = useState<string>('ERP');
  const [toArea, setToArea] = useState<string>('Consultoria');
  const [counts, setCounts] = useState<null | { resources: number; projects: number; pipeline: number; total: number }>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Carrega áreas existentes
  useEffect(() => {
    let alive = true;
    setLoading(true);
    listAllAreas()
      .then((list) => {
        if (!alive) return;
        setAreas(list);
        // Pré-seleciona ERP se existir
        if (list.includes('ERP')) setFromArea('ERP');
        else if (list.length > 0 && !list.includes(fromArea)) setFromArea(list[0]);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreview = async () => {
    if (!fromArea.trim()) return;
    setLoading(true);
    try {
      const res = await countAreaOccurrences(fromArea.trim());
      setCounts({
        resources: res.perCollection.resources,
        projects: res.perCollection.projects,
        pipeline: res.perCollection.pipeline,
        total: res.total,
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao contar',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await renameArea(fromArea.trim(), toArea.trim());
      toast({
        title: 'Renomeação concluída',
        description: `${res.total} registro(s) atualizado(s): Recursos ${res.perCollection.resources}, Projetos ${res.perCollection.projects}, Pipeline ${res.perCollection.pipeline}.`,
        variant: 'success',
      });
      // Recarrega lista
      setCounts(null);
      const list = await listAllAreas();
      setAreas(list);
    } catch (e: any) {
      toast({
        title: 'Falha ao renomear',
        description: e?.message ?? 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
      setConfirmOpen(false);
    }
  };

  const canRun =
    !!fromArea.trim() && !!toArea.trim() && fromArea.trim() !== toArea.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Padronização de Áreas</CardTitle>
        <CardDescription>
          Renomeia o valor do campo "área" em massa em <strong>Recursos</strong>,{' '}
          <strong>Projetos</strong> e <strong>Pipeline</strong>. Útil para corrigir
          inconsistências (ex: trocar "ERP" por "Consultoria").
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs">De (área atual)</Label>
            {areas.length > 0 ? (
              <Select value={fromArea} onValueChange={setFromArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={fromArea}
                onChange={(e) => setFromArea(e.target.value)}
                placeholder="ERP"
              />
            )}
          </div>
          <div>
            <Label className="mb-1 block text-xs">Para (novo nome)</Label>
            <Input
              value={toArea}
              onChange={(e) => setToArea(e.target.value)}
              placeholder="Consultoria"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={loading || !fromArea.trim()}
          >
            {loading ? 'Contando...' : 'Pré-visualizar impacto'}
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canRun || running}
          >
            {running ? 'Renomeando...' : 'Renomear área'}
          </Button>
        </div>

        {counts && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="mb-2 font-medium">
              {counts.total} registro(s) seriam atualizado(s) ao renomear "
              {fromArea}" → "{toArea}":
            </p>
            <ul className="space-y-1 text-xs">
              <li>· Recursos: {counts.resources}</li>
              <li>· Projetos: {counts.projects}</li>
              <li>· Pipeline: {counts.pipeline}</li>
            </ul>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Renomear "${fromArea}" → "${toArea}"?`}
        description={
          counts
            ? `${counts.total} registro(s) serão atualizado(s) em Recursos, Projetos e Pipeline.`
            : 'A operação atualiza todos os registros com este nome de área. Recomendo clicar antes em "Pré-visualizar impacto".'
        }
        confirmText={running ? 'Renomeando...' : 'Confirmar renomeação'}
        onConfirm={handleRun}
      />
    </Card>
  );
}

function DangerRow({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="destructive" onClick={onClick}>
        Excluir
      </Button>
    </div>
  );
}

// ============================ ABOUT ============================
function AboutSection() {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '—';
  const env = import.meta.env.MODE;
  const emulators = import.meta.env.VITE_USE_EMULATORS === 'true';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sobre o sistema</CardTitle>
        <CardDescription>Informações de build e ambiente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Aplicação" value="Resource Allocation v1.0.0" />
        <Row label="Ambiente" value={env} />
        <Row label="Firebase Project" value={projectId} />
        <Row label="Emuladores" value={emulators ? 'Ativos' : 'Inativos'} />
        <Row
          label="Stack"
          value="React 18 · Vite · TypeScript · Tailwind · shadcn/ui · Firebase · React Query · Zustand"
        />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
