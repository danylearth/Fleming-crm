import { useState } from 'react';
import { Button } from './index';
import { X, Upload, FileText } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { parseCsv } from '../../utils/csv';
import { IMPORT_CONFIGS, autoDetect, transformValue, type ImportEntity } from '../../utils/importConfig';

interface ImportResult {
  inserted: number;
  skipped: { row: number; reason: string }[];
}

export default function CsvImport({ entity, onClose, onDone }: {
  entity: ImportEntity;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const config = IMPORT_CONFIGS[entity];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  // field key -> CSV column index, -1 = skip
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = async (file: File) => {
    setError('');
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        setError('CSV must have a header row and at least one data row');
        return;
      }
      if (rows.length - 1 > 1000) {
        setError('CSV has too many rows (maximum 1,000)');
        return;
      }
      setFileName(file.name);
      setHeaders(rows[0]);
      setDataRows(rows.slice(1));
      setMapping(autoDetect(rows[0], config.fields));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse CSV');
    }
  };

  const requiredUnmapped = config.fields.filter(f => f.required && mapping[f.key] === undefined);

  const mappedRows = () => dataRows.map(row => {
    const out: Record<string, string> = {};
    for (const field of config.fields) {
      const idx = mapping[field.key];
      if (idx === undefined || idx < 0) continue;
      const v = transformValue(row[idx] ?? '', field);
      if (v !== '') out[field.key] = v;
    }
    return out;
  });

  const missingRequiredCount = mappedRows().filter(r => config.fields.some(f => f.required && !r[f.key])).length;

  const runImport = async () => {
    setImporting(true);
    setError('');
    try {
      const res = await api.post(`/api/import/${entity}`, { rows: mappedRows() }, `/api/${entity}`) as ImportResult;
      setResult(res);
      onDone();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e?.message || 'Import failed — nothing was imported');
    }
    setImporting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import {config.title} from CSV</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {step === 1 && (
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[var(--border-input)] rounded-xl p-10 cursor-pointer hover:border-[var(--accent-orange)] transition-colors">
            <Upload size={28} className="text-[var(--text-muted)]" />
            <span className="text-sm text-[var(--text-secondary)]">Choose a CSV file</span>
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        )}

        {step === 2 && (
          <>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <FileText size={12} /> {fileName} — {dataRows.length} rows. Match CSV columns to fields; auto-detected matches are pre-selected.
            </p>
            <div className="space-y-2">
              {config.fields.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <span className="text-sm w-48 shrink-0">
                    {field.label}{field.required && <span className="text-red-400"> *</span>}
                  </span>
                  <select
                    value={mapping[field.key] ?? -1}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setMapping(m => {
                        const next = { ...m };
                        if (v < 0) delete next[field.key];
                        else next[field.key] = v;
                        return next;
                      });
                    }}
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value={-1}>— skip —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `(column ${i + 1})`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {requiredUnmapped.length > 0 && (
              <p className="text-xs text-amber-400">Map required fields to continue: {requiredUnmapped.map(f => f.label).join(', ')}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={requiredUnmapped.length > 0}>Next</Button>
            </div>
          </>
        )}

        {step === 3 && !result && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Preview — first {Math.min(5, dataRows.length)} of {dataRows.length} rows.</p>
            <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    {config.fields.filter(f => mapping[f.key] !== undefined).map(f => (
                      <th key={f.key} className="text-left py-2 px-3 font-medium">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows().slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-[var(--border-subtle)]">
                      {config.fields.filter(f => mapping[f.key] !== undefined).map(f => (
                        <td key={f.key} className="py-2 px-3 truncate max-w-[160px]">{r[f.key] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missingRequiredCount > 0 && (
              <p className="text-xs text-amber-400">{missingRequiredCount} row{missingRequiredCount === 1 ? '' : 's'} missing required values will be skipped.</p>
            )}
            <p className="text-xs text-[var(--text-muted)]">Duplicates of existing records are skipped and reported.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={runImport} disabled={importing}>{importing ? 'Importing…' : `Import ${dataRows.length} rows`}</Button>
            </div>
          </>
        )}

        {result && (
          <>
            <p className="text-sm">
              <span className="text-emerald-400 font-semibold">{result.inserted} imported</span>
              {result.skipped.length > 0 && <span className="text-[var(--text-muted)]">, {result.skipped.length} skipped</span>}
            </p>
            {result.skipped.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-[var(--border-subtle)] rounded-lg p-3 space-y-1">
                {result.skipped.map((s, i) => (
                  <p key={i} className="text-xs text-[var(--text-muted)]">Row {s.row}: {s.reason}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
