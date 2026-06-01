import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ImportDialog } from '@/components/common/ImportDialog';
import { ProjectFormDialog } from './ProjectFormDialog';
import { ProjectTimeline } from './ProjectTimeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/store/authStore';
import { deleteProject, bulkCreateProjects } from '@/services/projectsService';
import { toast } from '@/hooks/useToast';
import { downloadCSV, toCSV, pick } from '@/lib/csv';
import { parsePtDate, formatDate } from '@/lib/utils';
import type { Project, ProjectPriority, ProjectStatus } from '@/types';

const PAGE_SIZE = 25;

function StatusBadge({ s }: { s: ProjectStatus }) {
  const map: Record<ProjectStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
    'Planejado': 'secondary',
    'Em Andamento': 'default',
    'Pausado': 'warning',
    'Concluído': 'success',
    'Cancelado': 'destructive',
  };
  return <Badge variant={map[s]}>{s}</Badge>;
}

function PriorityBadge({ p }: { p: ProjectPriority }) {
  const map: Record<ProjectPriority, 'default' | 'secondary' | 'destructive' | 'warning'> = {
    'Baixa': 'secondary',
    'Média': 'default',
    'Alta': 'warning',
    'Crítica': 'destructive',
  };
  return <Badge variant={map[p]}>{p}</Badge>;
}

export function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();
  const { canManage, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    let arr = projects;
    if (statusFilter !== 'all') arr = arr.filter((p) => p.status === statusFilter);
    const s = search.trim().toLowerCase();
    if (s) {
      arr = arr.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.client?.toLowerCase().includes(s) ||
          p.area?.toLowerCase().includes(s)
      );
    }
    return arr;
  }, [projects, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const handleExport = () => {
    const rows = projects.map((p) => ({
      Nome: p.name,
      Area: p.area ?? '',
      Cliente: p.client ?? '',
      Prioridade: p.priority,
      Status: p.status,
      'Data Inicio': p.startDate ?? '',
      'Data Fim': p.endDate ?? '',
    }));
    downloadCSV(`projetos_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    toast({ title: 'CSV gerado', variant: 'success' });
  };

  return (
    <div>
      <PageHeader
        title="Projetos"
        description="Cadastro e gestão de projetos"
        actions={
          <>
            <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4" />Exportar</Button>
            {canManage() && (
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" />Importar</Button>
            )}
            {canManage() && (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />Novo</Button>
            )}
          </>
        }
      />
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
        <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="Planejado">Planejado</SelectItem>
              <SelectItem value="Em Andamento">Em Andamento</SelectItem>
              <SelectItem value="Pausado">Pausado</SelectItem>
              <SelectItem value="Concluído">Concluído</SelectItem>
              <SelectItem value="Cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} projetos</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && [...Array(5)].map((_, i) => (
              <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ))}
            {!isLoading && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum projeto encontrado.</TableCell>
              </TableRow>
            )}
            {pageRows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.client}</TableCell>
                <TableCell>{p.area}</TableCell>
                <TableCell><PriorityBadge p={p.priority} /></TableCell>
                <TableCell><StatusBadge s={p.status} /></TableCell>
                <TableCell>{formatDate(p.startDate)}</TableCell>
                <TableCell>{formatDate(p.endDate)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canManage() && (
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setFormOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin() && (
                      <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <ProjectTimeline projects={projects} />
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} project={editing} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Excluir projeto?"
        description={`O projeto "${confirmDelete?.name}" será removido permanentemente.`}
        destructive
        confirmText="Excluir"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await deleteProject(confirmDelete.id);
            toast({ title: 'Projeto removido com sucesso.', variant: 'success' });
          } catch (e: any) {
            toast({ title: 'Falha ao remover', description: String(e?.message ?? e), variant: 'destructive' });
          }
        }}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Projetos"
        templateHint="Colunas: Nome; Area; Cliente; Prioridade; Status; Data Inicio; Data Fim"
        templateColumns={['Nome', 'Area', 'Cliente', 'Prioridade', 'Status', 'Data Inicio', 'Data Fim']}
        templateExample={{
          Nome: 'Projeto Exemplo',
          Area: 'Tecnologia',
          Cliente: 'ACME Ltda',
          Prioridade: 'Média',
          Status: 'Em Andamento',
          'Data Inicio': '01/01/2026',
          'Data Fim': '31/12/2026',
        }}
        templateFilename="template_projetos"
        parseRow={(row, idx) => {
          const name = pick(row, 'Nome', 'name');
          if (!name) return { __error: `Linha ${idx}: nome vazio` };
          return {
            name,
            area: pick(row, 'Area', 'Área'),
            client: pick(row, 'Cliente', 'client'),
            priority: (pick(row, 'Prioridade') || 'Média') as ProjectPriority,
            status: (pick(row, 'Status') || 'Planejado') as ProjectStatus,
            startDate: parsePtDate(pick(row, 'Data Inicio', 'Data Início', 'startDate')),
            endDate: parsePtDate(pick(row, 'Data Fim', 'endDate')),
          };
        }}
        bulkCreate={(items) => bulkCreateProjects(items as any)}
      />
    </div>
  );
}
