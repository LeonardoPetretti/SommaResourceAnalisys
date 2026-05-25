import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

/** Lê CSV detectando o delimitador automaticamente. Aceita UTF-8 com/sem BOM. */
export function parseCSV(text: string): ParsedFile {
  // Auto-detect: o Papa já tenta, mas reforçamos com lista comum
  const cleaned = text.replace(/^﻿/, '');
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [';', ',', '\t', '|'],
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  });
  const headers = result.meta.fields?.map((h) => h.trim()) ?? [];
  return { headers, rows: result.data };
}

/** Lê arquivo XLSX e retorna a primeira planilha como CSV-like. */
export function parseXLSXBuffer(buf: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    raw: false,
    defval: '',
  });
  const headers = Object.keys(json[0] ?? {}).map((h) => h.trim());
  const rows = json.map((r) => {
    const o: Record<string, string> = {};
    for (const k of Object.keys(r)) {
      o[k.trim()] = String(r[k] ?? '').trim();
    }
    return o;
  });
  return { headers, rows };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    return parseXLSXBuffer(buf);
  }
  const text = await file.text();
  return parseCSV(text);
}

/** Exporta linhas como CSV (delimitador ; — compatível com Excel BR). */
export function toCSV(rows: Record<string, any>[], headers?: string[]): string {
  if (rows.length === 0 && !headers) return '';
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const csv = Papa.unparse(
    { fields: cols, data: rows.map((r) => cols.map((c) => r[c] ?? '')) },
    { delimiter: ';', header: true, quotes: false }
  );
  return '﻿' + csv; // BOM para Excel BR
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pega valor por nome com tolerância (case/acento/espaços). */
export function pick(row: Record<string, string>, ...candidates: string[]): string {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  const indexed: Record<string, string> = {};
  for (const k of Object.keys(row)) indexed[norm(k)] = row[k];
  for (const c of candidates) {
    const v = indexed[norm(c)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}
