import { useState } from 'react';
import { Upload, FileDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { parseFile, toCSV, downloadCSV, type ParsedFile } from '@/lib/csv';
import { toast } from '@/hooks/useToast';

interface Props<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  templateHint: string;
  parseRow: (row: Record<string, string>, index: number) => T | { __error: string };
  bulkCreate: (items: T[]) => Promise<number>;
  onDone?: () => void;
  /** Colunas para gerar template vazio (1 linha exemplo opcional). */
  templateColumns?: string[];
  /** Linha de exemplo opcional (para template). */
  templateExample?: Record<string, string>;
  /** Nome do arquivo do template (sem extensão). */
  templateFilename?: string;
}

export function ImportDialog<T>({
  open,
  onOpenChange,
  title,
  templateHint,
  parseRow,
  bulkCreate,
  onDone,
  templateColumns,
  templateExample,
  templateFilename,
}: Props<T>) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, rejected: 0 });
  const [errors, setErrors] = useState<{ row: number; reason: string }[]>([]);
  const [started, setStarted] = useState(0);

  const reset = () => {
    setFile(null);
    setParsed(null);
    setRunning(false);
    setProgress({ done: 0, total: 0, rejected: 0 });
    setErrors([]);
  };

  const handleDownloadTemplate = () => {
    if (!templateColumns || templateColumns.length === 0) return;
    const rows: Record<string, string>[] = [];
    if (templateExample) {
      const row: Record<string, string> = {};
      for (const col of templateColumns) row[col] = templateExample[col] ?? '';
      rows.push(row);
    }
    const csv = toCSV(rows, templateColumns);
    const name = templateFilename || 'template';
    downloadCSV(`${name}.csv`, csv);
    toast({ title: 'Template baixado', variant: 'success' });
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setErrors([]);
    try {
      const p = await parseFile(f);
      setParsed(p);
      setProgress({ done: 0, total: p.rows.length, rejected: 0 });
    } catch (e: any) {
      toast({ title: 'Erro ao ler arquivo', description: String(e?.message ?? e), variant: 'destructive' });
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setRunning(true);
    setStarted(Date.now());
    const valid: T[] = [];
    const errs: { row: number; reason: string }[] = [];

    // Parsing por linha (continua mesmo com erros)
    parsed.rows.forEach((row, i) => {
      const result = parseRow(row, i + 2); // +2 considerando header e 1-indexado
      if ((result as any).__error) {
        errs.push({ row: i + 2, reason: (result as any).__error });
      } else {
        valid.push(result as T);
      }
    });

    setErrors(errs);

    try {
      const chunk = 200;
      let processed = 0;
      for (let i = 0; i < valid.length; i += chunk) {
        const slice = valid.slice(i, i + chunk);
        await bulkCreate(slice);
        processed += slice.length;
        setProgress({ done: processed, total: parsed.rows.length, rejected: errs.length });
      }
      toast({
        title: 'Importação concluída',
        description: `${valid.length} importados, ${errs.length} rejeitados`,
        variant: errs.length === 0 ? 'success' : 'default',
      });
      onDone?.();
      // Fecha automaticamente se sem erros
      if (errs.length === 0) {
        setTimeout(() => {
          onOpenChange(false);
          reset();
        }, 800);
      }
    } catch (e: any) {
      toast({ title: 'Falha na importação', description: String(e?.message ?? e), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const elapsed = started ? Math.round((Date.now() - started) / 1000) : 0;
  const eta =
    progress.done > 0 && progress.total > 0
      ? Math.max(0, Math.round((elapsed / progress.done) * (progress.total - progress.done)))
      : 0;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{templateHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            disabled={running}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {parsed && (
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Arquivo</p>
                  <p className="font-medium truncate" title={file?.name}>{file?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Linhas</p>
                  <p className="font-medium">{parsed.rows.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Importados</p>
                  <p className="font-medium text-[hsl(var(--success))]">{progress.done}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Rejeitados</p>
                  <p className="font-medium text-destructive">{progress.rejected}</p>
                </div>
              </div>
            </Card>
          )}

          {running && (
            <div className="space-y-2">
              <Progress value={pct} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Importando... {progress.done} de {progress.total} processados
                </span>
                <span>ETA: {eta}s</span>
              </div>
            </div>
          )}

          {errors.length > 0 && !running && (
            <Card className="max-h-40 overflow-auto p-3">
              <p className="mb-2 text-sm font-medium">Log de erros</p>
              <ul className="space-y-1 text-xs">
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge variant="destructive" className="text-[10px]">linha {e.row}</Badge>
                    <span className="text-muted-foreground">{e.reason}</span>
                  </li>
                ))}
                {errors.length > 50 && (
                  <li className="text-muted-foreground">... e mais {errors.length - 50}</li>
                )}
              </ul>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {templateColumns && templateColumns.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              disabled={running}
              className="mr-auto"
            >
              <FileDown className="h-4 w-4" />
              Baixar template vazio
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Fechar
          </Button>
          <Button onClick={handleImport} disabled={!parsed || running}>
            <Upload className="h-4 w-4" />
            {running ? 'Importando...' : 'Iniciar Importação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
