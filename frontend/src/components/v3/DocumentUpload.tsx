import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, Button, SectionHeader, EmptyState, Select } from './index';
import { Upload, FileText, Trash2, Download, X, Plus } from 'lucide-react';

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
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export default function DocumentUpload({ entityType, entityId }: Props) {
  const { token } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/documents/${entityType}/${entityId}`, { headers }).then(r => r.json()),
      fetch(`${API_URL}/api/documents/types/${entityType}`, { headers }).then(r => r.json()),
    ]).then(([d, t]) => {
      setDocs(Array.isArray(d) ? d : []);
      setDocTypes(Array.isArray(t) ? t : []);
      if (Array.isArray(t) && t.length) setSelectedType(t[0]);
    }).catch(() => { })
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  const handleUpload = async (file: File) => {
    if (!selectedType) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', selectedType);
      const res = await fetch(`${API_URL}/api/documents/${entityType}/${entityId}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const newDoc = await res.json();
      if (newDoc.id) {
        setDocs(prev => [{ ...newDoc, uploaded_at: new Date().toISOString() }, ...prev]);
        setShowUpload(false);
      }
    } catch (e) { console.error(e); }
    setUploading(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/documents/${id}`, { method: 'DELETE', headers });
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleDownload = (id: number, name: string) => {
    const a = document.createElement('a');
    a.href = `${API_URL}/api/documents/download/${id}`;
    a.download = name;
    // For auth, open in new tab (cookie-less download won't work with bearer)
    window.open(`${API_URL}/api/documents/download/${id}`, '_blank');
  };

  const mimeIcon = (mime: string) => {
    if (mime?.startsWith('image/')) return '🖼️';
    if (mime?.includes('pdf')) return '📄';
    return '📎';
  };

  return (
    <Card className="p-6">
      <SectionHeader
        title="Documents"
        action={() => setShowUpload(!showUpload)}
        actionLabel={showUpload ? 'Cancel' : 'Upload'}
      />

      {showUpload && (
        <div className="mb-4 p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] space-y-3">
          <Select
            label="Document Type"
            value={selectedType}
            onChange={setSelectedType}
            options={docTypes.map(t => ({ value: t, label: t }))}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            variant="gradient"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={14} className="mr-2" />
            {uploading ? 'Uploading...' : 'Choose File'}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-[var(--text-muted)] text-sm">Loading...</div>
      ) : docs.length === 0 ? (
        <EmptyState message="No documents uploaded" icon={<FileText size={32} />} />
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] group">
              <span className="text-lg">{mimeIcon(doc.mime_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.original_name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {doc.doc_type} · {formatBytes(doc.size)} · {(() => { const d = new Date(doc.uploaded_at); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}
                </p>
              </div>
              <button
                onClick={() => handleDownload(doc.id, doc.original_name)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Download size={14} />
              </button>
              <button
                onClick={() => handleDelete(doc.id)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
