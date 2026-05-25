import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ImportDialog } from '@/components/common/ImportDialog';
import { ResourceFormDialog } from './ResourceFormDialog';
import { useResources } from '@/hooks/useResources';
import { useAuthStore } from '@/store/authStore';
import { deleteResource, bulkCreateResources } from '@/services/resourcesService';
import { toast } from '@/hooks/useToast';
import { downloadCSV, toCSV, pick } from '@/lib/csv';
import { parsePercent, formatPercent } from '@/lib/utils';
import type { Resource } from '@/types';

const PAGE_SIZE = 25;

export function ResourcesPage() {
  const { data: resources = [], isLoading } = useResources();
  const { canManage, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Resource | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return resources;
    return resources.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.role?.toLowerCase().includes(s) ||
        r.area?.toLowerCase().includes(s) ||
        r.skills?.some((sk) => sk.toLowerCase().includes(s))
    );
  }, [resources, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const handleExport = () => {
    const rows = resources.map((r) => ({
      Nome: r.name,
      Cargo: r.role ?? '',
      Area: r.area ?? '',
      Skills: (r.skills ?? []).join(', '),
      Capacity: formatPercent(r.capacity ?? 1),
    }));
    downloadCSV(`recursos_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    toast({ title: 'CSV gerado', variant: 'success' });
  };

  return (
    <div>
      <PageHeader
        title="Recursos"
        description="Cadastro de consultores e colaboradores"
        actions={
          <>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            {canManage() && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Importar
              </Button>
            )}
            {canManage() && (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            )}
          </>
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cargo, área, skills..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <span className="text-sm text-muted-foreground">{filtered.length} recursos</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))
            )}
            {!isLoading && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum recurso encontrado.
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.role}</TableCell>
                <TableCell>{r.area}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(r.skills ?? []).slice(0, 4).map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                    ))}
                    {(r.skills ?? []).length > 4 && (
                      <Badge variant="outline" className="text-[10px]">+{(r.skills ?? []).length - 4}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatPercent(r.capacity ?? 1)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canManage() && (
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setFormOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin() && (
                      <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)}>
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

      <ResourceFormDialog open={formOpen} onOpenChange={setFormOpen} resource={editing} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Excluir recurso?"
        description={`O recurso "${confirmDelete?.name}" será removido permanentemente.`}
        destructive
        confirmText="Excluir"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await deleteResource(confirmDelete.id);
            toast({ title: 'Recurso removido com sucesso.', variant: 'success' });
          } catch (e: any) {
            toast({ title: 'Falha ao remover', description: String(e?.message ?? e), variant: 'destructive' });
          }
        }}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Recursos"
        templateHint="Colunas esperadas: Nome; Cargo; Area; Skills; Capacity. Aceita CSV (;, , tab) e XLSX."
        templateColumns={['Nome', 'Cargo', 'Area', 'Skills', 'Capacity']}
        templateExample={{
          Nome: 'Maria da Silva',
          Cargo: 'Consultor Pleno',
          Area: 'Tecnologia',
          Skills: 'ABAP; SAP FI; SQL',
          Capacity: '100%',
        }}
        templateFilename="template_recursos"
        parseRow={(row, idx) => {
          const name = pick(row, 'Nome', 'Nome Completo', 'name');
          if (!name) return { __error: `Linha ${idx}: nome vazio` };
          return {
            name,
            role: pick(row, 'Cargo', 'role'),
            area: pick(row, 'Area', 'Área', 'Área Corporativa'),
            skills: pick(row, 'Skills', 'Skills Principais').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
            capacity: parsePercent(pick(row, 'Capacity', 'Capacidade')) || 1,
            active: true,
          };
        }}
        bulkCreate={(items) => bulkCreateResources(items as any)}
      />
    </div>
  );
}
