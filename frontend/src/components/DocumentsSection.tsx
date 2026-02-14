import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, Download, X, AlertCircle } from 'lucide-react';

interface Document {
  id: number;
  doc_type: string;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

interface Props {
  entityType: 'landlord' | 'landlord_bdm' | 'tenant' | 'tenant_enquiry' | 'property' | 'maintenance';
  entityId: number;
  title?: string;
}

export default function DocumentsSection({ entityType, entityId, title }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('token');

  useEffect(() => { fetchDocuments(); fetchDocTypes(); }, [entityType, entityId]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/documents/${entityType}/${entityId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDocuments(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchDocTypes = async () => {
    try {
      const res = await fetch(`/api/documents/types/${entityType}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const types = await res.json(); setDocTypes(types); if (types.length > 0) setSelectedType(types[0]); }
    } catch {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) return;
    setUploading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', selectedType);
    try {
      const res = await fetch(`/api/documents/${entityType}/${entityId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
      if (res.ok) { fetchDocuments(); setShowUpload(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
      else { const data = await res.json(); setError(data.error || 'Upload failed'); }
    } catch { setError('Upload failed'); } finally { setUploading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this document?')) return;
    try { const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (res.ok) fetchDocuments(); } catch {}
  };

  const handleDownload = (id: number) => { window.open(`/api/documents/download/${id}?token=${token}`, '_blank'); };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const sectionTitle = title || (entityType === 'property' ? 'Documents & Certificates' : 'Documents');

  return (
    <div className="border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{sectionTitle}</h2>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {showUpload ? <X className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
          {showUpload ? 'Cancel' : 'Upload'}
        </button>
      </div>

      {showUpload && (
        <div className="mb-4 p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Document Type</label>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                {docTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="flex-[2] min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">File (PDF, JPG, PNG, DOC — max 10MB)</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUpload}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                disabled={uploading}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700"
              />
            </div>
          </div>
          {uploading && <p className="mt-3 text-xs text-gray-500">Uploading...</p>}
          {error && (
            <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-6">Loading...</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No documents uploaded yet</p>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.original_name}</p>
                <p className="text-xs text-gray-400">
                  {doc.doc_type} • {formatSize(doc.size)} • {new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => handleDownload(doc.id)} title="Download"
                className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(doc.id)} title="Delete"
                className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
