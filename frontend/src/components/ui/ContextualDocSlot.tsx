import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CheckCircle, Upload, Download, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

interface Doc {
  id: number;
  doc_type: string;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

interface Props {
  entityType: string;
  entityId: number;
  docType: string;
  label: string;
  applicantNumber?: number;
  onDocChange?: () => void;
}

function truncateName(name: string, max = 20) {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.') !== -1 ? name.slice(name.lastIndexOf('.')) : '';
  return name.slice(0, max - ext.length - 3) + '...' + ext;
}

export default function ContextualDocSlot({ entityType, entityId, docType, label, applicantNumber, onDocChange }: Props) {
  const { token } = useAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    const appQuery = applicantNumber !== undefined ? `?applicant_number=${applicantNumber}` : '';
    fetch(`${API_URL}/api/documents/${entityType}/${entityId}${appQuery}`, { headers })
      .then(r => r.json())
      .then((docs: Doc[]) => {
        const match = docs.find(d => d.doc_type === docType);
        setDoc(match || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityType, entityId, docType, applicantNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      if (applicantNumber !== undefined) {
        fd.append('applicant_number', String(applicantNumber));
      }
      const res = await fetch(`${API_URL}/api/documents/${entityType}/${entityId}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error('Upload failed');
      const newDoc = await res.json();
      if (newDoc.id) {
        setDoc({ ...newDoc, uploaded_at: new Date().toISOString() });
        onDocChange?.();
      }
    } catch (e) {
      console.error(e);
      alert('Failed to upload document');
    }
    setUploading(false);
  };

  const handleDelete = async () => {
    if (!doc) return;
    try {
      await fetch(`${API_URL}/api/documents/${doc.id}`, { method: 'DELETE', headers });
      setDoc(null);
      onDocChange?.();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = () => {
    if (!doc) return;
    window.open(`${API_URL}/api/documents/download/${doc.id}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex-1 min-w-[200px] h-[72px] rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-subtle)] animate-pulse" />
    );
  }

  // Uploaded state
  if (doc) {
    return (
      <div className="flex-1 min-w-[200px] rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 group">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-400">{label}</p>
            <p className="text-xs text-[var(--text-muted)] truncate">{truncateName(doc.original_name)}</p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Download size={14} />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      </div>
    );
  }

  // Empty state — click to upload
  return (
    <button
      onClick={() => fileRef.current?.click()}
      disabled={uploading}
      className="flex-1 min-w-[200px] rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-subtle)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-all p-3 cursor-pointer group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--border-color)] transition-colors">
          <Upload size={18} className="text-[var(--text-muted)]" />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {uploading ? 'Uploading...' : 'Click to upload file'}
          </p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
    </button>
  );
}
