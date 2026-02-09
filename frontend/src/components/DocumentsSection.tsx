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

  useEffect(() => {
    fetchDocuments();
    fetchDocTypes();
  }, [entityType, entityId]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/documents/${entityType}/${entityId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDocuments(await res.json());
    } catch (err) {
      console.error('Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  const fetchDocTypes = async () => {
    try {
      const res = await fetch(`/api/documents/types/${entityType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const types = await res.json();
        setDocTypes(types);
        if (types.length > 0) setSelectedType(types[0]);
      }
    } catch (err) {
      console.error('Failed to fetch doc types');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) return;

    setUploading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', selectedType);

    try {
      const res = await fetch(`/api/documents/${entityType}/${entityId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        fetchDocuments();
        setShowUpload(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        const data = await res.json();
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this document?')) return;
    
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchDocuments();
    } catch (err) {
      console.error('Failed to delete');
    }
  };

  const handleDownload = (id: number) => {
    window.open(`/api/documents/download/${id}?token=${token}`, '_blank');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  const sectionTitle = title || (entityType === 'property' ? 'Documents & Certificates' : 'KYC Documents');

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#102a43', fontSize: '18px' }}>{sectionTitle}</h3>
        <button
          onClick={() => setShowUpload(!showUpload)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: '#102a43',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {showUpload ? <X size={16} /> : <Upload size={16} />}
          {showUpload ? 'Cancel' : 'Upload'}
        </button>
      </div>

      {showUpload && (
        <div style={{
          background: '#f8fafc',
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px dashed #cbd5e1'
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '4px' }}>
                Document Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                {docTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '2', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '4px' }}>
                File (PDF, JPG, PNG, DOC - max 10MB)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUpload}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                disabled={uploading}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  background: '#fff'
                }}
              />
            </div>
          </div>
          {uploading && <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: '14px' }}>Uploading...</p>}
          {error && (
            <p style={{ margin: '12px 0 0', color: '#dc2626', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={16} /> {error}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#64748b', margin: 0 }}>Loading documents...</p>
      ) : documents.length === 0 ? (
        <p style={{ color: '#64748b', margin: 0, textAlign: 'center', padding: '24px 0' }}>
          No documents uploaded yet
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {documents.map(doc => (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#f8fafc',
                borderRadius: '8px'
              }}
            >
              <FileText size={20} color="#64748b" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontWeight: 500, 
                  color: '#1e293b',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {doc.original_name}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  {doc.doc_type} • {formatSize(doc.size)} • {formatDate(doc.uploaded_at)}
                </div>
              </div>
              <button
                onClick={() => handleDownload(doc.id)}
                style={{
                  padding: '6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#102a43'
                }}
                title="Download"
              >
                <Download size={18} />
              </button>
              <button
                onClick={() => handleDelete(doc.id)}
                style={{
                  padding: '6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#dc2626'
                }}
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
