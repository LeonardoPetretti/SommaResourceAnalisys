import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Download, Upload, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ImportDialog } from '@/components/common/ImportDialog';
import { AllocationFormDialog } from './AllocationFormDialog';
import { AllocationTimeline } from './AllocationTimeline';
import { useAllocations } from '@/hooks/useAllocations';
import { useResources } from '@/hooks/useResources';
import { useProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/store/authStore';
import { deleteAllocation, bulkCreateAllocations } from '@/services/allocationsService';
import { toast } from '@/hooks/useToast';
import { downloadCSV, toCSV, pick } from '@/lib/csv';
import { parsePercent, formatPercent, formatDate, parsePtDate, rangesOverlap } from '@/lib/utils';
import type { Allocation } from '@/types';

const PAGE_SIZE = 25;

export function AllocationsPage() {
  const { data: allocations = [], isLoading } = useAllocations();
  const { data: resources = [] } = useResources();
  const { data: projects = [] } = useProjects();
  const { canManage } = useAuthStore();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Allocation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Allocation | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Conjunto de alocações com conflito (FTE somado no overlap > capacity do recurso)
  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    const byRes = new Map<string, Allocation[]>();
    for (const a of allocations) {
      const arr = byRes.get(a.resourceId) ?? [];
      arr.push(a);
      byRes.set(a.resourceId, arr);
    }
    for (const [rid, arr] of byRes) {
      const cap = resources.find((r) => r.id === rid)?.capacity ?? 1;
      for (const a of arr) {
        let sum = a.fte;
        for (const b of arr) {
          if (b.id === a.id) continue;
          if (rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
            sum += b.fte;
          }
        }
        if (sum > cap + 0.0001) set.add(a.id);
      }
    }
    return set;
  }, [allocations, resources]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allocations;
    return allocations.filter(
      (a) =>
        a.resourceName?.toLowerCase().includes(s) ||
        a.projectName?.toLowerCase().includes(s) ||
        a.phase?.toLowerCase().includes(s)
    );
  }, [allocations, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const handleExport = () => {
    const rows = allocations.map((a) => ({
      Consultores: a.resourceName ?? '',
      Projeto: a.projectName ?? '',
      Fase: a.phase ?? '',
      FTE: formatPercent(a.fte ?? 0),
      'Data Inicio': a.startDate ?? '',
      'Data Fim': a.endDate ?? '',
    }));
    downloadCSV(`alocacoes_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    toast({ title: 'CSV gerado', variant: 'success' });
  };

  return (
    <div>
      <PageHeader
        title="Alocações"
        description="Gestão de alocações por recurso, projeto e período"
        actions={
          <>
            <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4" />Exportar</Button>
            {canManage() && <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" />Importar</Button>}
            {canManage() && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />Nova</Button>}
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
            <div className="mb-4 flex items-center gap-3">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <span className="text-sm text-muted-foreground">{filtered.length} alocações</span>
              {conflictIds.size > 0 && (
                <Badge variant="destructive" className="ml-auto"><AlertTriangle className="mr-1 h-3 w-3" /> {conflictIds.size} conflito(s)</Badge>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead className="text-right">FTE</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && [...Array(5)].map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))}
                {!isLoading && pageRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma alocação.</TableCell>
                  </TableRow>
                )}
                {pageRows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.resourceName}</TableCell>
                    <TableCell>{a.projectName}</TableCell>
                    <TableCell>{a.phase}</TableCell>
                    <TableCell className="text-right">{formatPercent(a.fte)}</TableCell>
                    <TableCell>{formatDate(a.startDate)}</TableCell>
                    <TableCell>{formatDate(a.endDate)}</TableCell>
                    <TableCell>
                      {conflictIds.has(a.id) ? <Badge variant="destructive">Conflito</Badge> : <Badge variant="success">OK</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canManage() && (
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setFormOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage() && (
                          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(a)}>
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
          <AllocationTimeline allocations={allocations} resources={resources} projects={projects} />
        </TabsContent>
      </Tabs>

      <AllocationFormDialog open={formOpen} onOpenChange={setFormOpen} allocation={editing} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Excluir alocação?"
        description="A alocação será removida permanentemente."
        destructive
        confirmText="Excluir"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await deleteAllocation(confirmDelete.id);
            toast({ title: 'Alocação removida com sucesso.', variant: 'success' });
          } catch (e: any) {
            toast({ title: 'Falha ao remover', description: String(e?.message ?? e), variant: 'destructive' });
          }
        }}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Alocações"
        templateHint="Colunas: Consultores; Projeto; Fase; FTE; Data Inicio; Data Fim. Recurso e Projeto devem existir no cadastro."
        templateColumns={['Consultores', 'Projeto', 'Fase', 'FTE', 'Data Inicio', 'Data Fim']}
        templateExample={{
          Consultores: 'Maria da Silva',
          Projeto: 'Projeto Exemplo',
          Fase: 'Construção',
          FTE: '100%',
          'Data Inicio': '01/01/2026',
          'Data Fim': '31/12/2026',
        }}
        templateFilename="template_alocacoes"
        parseRow={(row, idx) => {
          const resName = pick(row, 'Consultores', 'Recurso', 'Consultor');
          const prjName = pick(row, 'Projeto', 'Project');
          if (!resName) return { __error: `Linha ${idx}: consultor vazio` };
          if (!prjName) return { __error: `Linha ${idx}: projeto vazio` };

          const res = resources.find((r) => r.name.toLowerCase() === resName.toLowerCase());
          const prj = projects.find((p) => p.name.toLowerCase() === prjName.toLowerCase());
          if (!res) return { __error: `Linha ${idx}: recurso "${resName}" não encontrado` };
          if (!prj) return { __error: `Linha ${idx}: projeto "${prjName}" não encontrado` };

          const startDate = parsePtDate(pick(row, 'Data Inicio', 'Data Início', 'Início', 'Inicio', 'startDate'));
          const endDate = parsePtDate(pick(row, 'Data Fim', 'Fim', 'Término', 'Termino', 'endDate'));
          if (!startDate || !endDate) return { __error: `Linha ${idx}: datas inválidas` };

          return {
            resourceId: res.id,
            resourceName: res.name,
            projectId: prj.id,
            projectName: prj.name,
            phase: pick(row, 'Fase', 'phase'),
            fte: parsePercent(pick(row, 'FTE', 'Alocação', 'Alocacao')) || 1,
            startDate,
            endDate,
          };
        }}
        bulkCreate={(items) => bulkCreateAllocations(items as any)}
      />
    </div>
  );
}
