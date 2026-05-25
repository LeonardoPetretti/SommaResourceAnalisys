import { cn } from '@/lib/utils';
import { utilizationColor } from '@/lib/timeBuckets';

export interface HeatmapCell {
  util: number; // 0..N (>1 = sobrealocação)
  detail?: string; // tooltip extra
  meta?: Record<string, any>;
}

interface Props {
  /** Rótulos das linhas (ex: áreas). */
  rows: string[];
  /** Rótulos das colunas (ex: semanas). */
  columns: string[];
  /** Matriz de células: cells[row][col]. */
  cells: HeatmapCell[][];
  /** Largura mínima de cada célula em px. */
  cellSize?: number;
  /** Callback ao clicar numa célula. */
  onCellClick?: (row: number, col: number, cell: HeatmapCell) => void;
  /** Mostra legenda de cores embaixo. */
  showLegend?: boolean;
  /** Sub-rótulo opcional de cada coluna (ex: mês). */
  columnSubLabels?: string[];
}

export function Heatmap({
  rows,
  columns,
  cells,
  cellSize = 32,
  onCellClick,
  showLegend = true,
  columnSubLabels,
}: Props) {
  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-px rounded-md bg-border p-px"
          style={{
            gridTemplateColumns: `minmax(140px, max-content) repeat(${columns.length}, ${cellSize}px)`,
          }}
        >
          {/* Cabeçalho */}
          <div className="bg-background sticky left-0" />
          {columns.map((c, ci) => (
            <div
              key={`col-${ci}`}
              className="flex flex-col items-center justify-end bg-background py-1 text-[10px] text-muted-foreground"
              style={{ width: cellSize }}
            >
              <span>{c}</span>
              {columnSubLabels?.[ci] && (
                <span className="text-[9px] opacity-60">{columnSubLabels[ci]}</span>
              )}
            </div>
          ))}

          {/* Linhas */}
          {rows.map((rowLabel, ri) => (
            <Row
              key={`row-${ri}`}
              rowLabel={rowLabel}
              ri={ri}
              cells={cells[ri] ?? []}
              cellSize={cellSize}
              onCellClick={onCellClick}
            />
          ))}
        </div>
      </div>

      {showLegend && <HeatmapLegend />}
    </div>
  );
}

function Row({
  rowLabel,
  ri,
  cells,
  cellSize,
  onCellClick,
}: {
  rowLabel: string;
  ri: number;
  cells: HeatmapCell[];
  cellSize: number;
  onCellClick?: (row: number, col: number, cell: HeatmapCell) => void;
}) {
  return (
    <>
      <div className="sticky left-0 flex items-center bg-background px-3 text-xs font-medium text-foreground">
        {rowLabel}
      </div>
      {cells.map((cell, ci) => {
        const pct = Math.round((cell.util ?? 0) * 100);
        const title = cell.detail
          ? `${rowLabel} · ${cell.detail} · ${pct}%`
          : `${rowLabel} · ${pct}%`;
        const clickable = !!onCellClick;
        return (
          <button
            key={`c-${ri}-${ci}`}
            disabled={!clickable}
            onClick={() => onCellClick?.(ri, ci, cell)}
            title={title}
            className={cn(
              'transition-transform',
              clickable && 'cursor-pointer hover:scale-110 hover:z-10'
            )}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: utilizationColor(cell.util ?? 0),
            }}
          >
            <span className="sr-only">{title}</span>
          </button>
        );
      })}
    </>
  );
}

function HeatmapLegend() {
  const stops = [0, 0.25, 0.5, 0.75, 1, 1.2];
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>Utilização:</span>
      <div className="flex items-center gap-1">
        {stops.map((s) => (
          <div key={s} className="flex flex-col items-center">
            <div
              className="h-3 w-6 rounded-sm"
              style={{ backgroundColor: utilizationColor(s) }}
            />
            <span className="mt-1 text-[9px]">
              {s > 1 ? '>100%' : `${Math.round(s * 100)}%`}
            </span>
          </div>
        ))}
      </div>
      <span className="ml-auto text-[10px]">
        Verde = capacidade ociosa · Amarelo = quase cheio · Vermelho = sobrealocado
      </span>
    </div>
  );
}
