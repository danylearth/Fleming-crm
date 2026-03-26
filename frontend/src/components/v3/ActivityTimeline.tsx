import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Clock, Eye, Plus, Pencil, Trash2, LogIn, Upload, StickyNote } from 'lucide-react';

interface AuditEntry {
  id: number;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: number;
  changes: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  view: { icon: Eye, color: 'text-blue-400 bg-blue-500/20', label: 'Viewed' },
  create: { icon: Plus, color: 'text-emerald-400 bg-emerald-500/20', label: 'Created' },
  update: { icon: Pencil, color: 'text-amber-400 bg-amber-500/20', label: 'Updated' },
  delete: { icon: Trash2, color: 'text-red-400 bg-red-500/20', label: 'Deleted' },
  login: { icon: LogIn, color: 'text-purple-400 bg-purple-500/20', label: 'Logged in' },
  export: { icon: Upload, color: 'text-cyan-400 bg-cyan-500/20', label: 'Exported' },
  note_added: { icon: StickyNote, color: 'text-pink-400 bg-pink-500/20', label: 'Note added' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeFormatted = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return `${dateFormatted} ${timeFormatted}`;
}

export default function ActivityTimeline({ entityType, entityId }: { entityType: string; entityId: number }) {
  const api = useApi();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/activity/${entityType}/${entityId}?limit=20`)
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) return <p className="text-xs text-[var(--text-muted)]">Loading...</p>;
  if (entries.length === 0) return <p className="text-xs text-[var(--text-muted)]">No activity yet</p>;

  // Deduplicate consecutive views from same user
  const deduped = entries.reduce<AuditEntry[]>((acc, e) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.action === 'view' && e.action === 'view' && prev.user_email === e.user_email) return acc;
    acc.push(e);
    return acc;
  }, []);

  return (
    <div className="relative pl-6 border-l-2 border-[var(--border-subtle)] space-y-4">
      {deduped.slice(0, 15).map(entry => {
        const config = ACTION_CONFIG[entry.action] || ACTION_CONFIG.view;
        const Icon = config.icon;
        return (
          <div key={entry.id} className="relative">
            <div className={`absolute -left-[25px] w-3 h-3 rounded-full ${config.color.split(' ')[1]}`} />
            <div className="flex items-start gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}>
                <Icon size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{config.label}</span>{' '}
                  <span className="text-[var(--text-secondary)]">{entityType}</span>
                </p>
                {entry.action === 'note_added' && entry.changes && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                    {(() => { try { const c = JSON.parse(entry.changes); return c.text || ''; } catch { return ''; } })()}
                  </p>
                )}
                <p className="text-[10px] text-[var(--text-muted)]">
                  {entry.user_email} · {formatDateTime(entry.created_at)} ({timeAgo(entry.created_at)})
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
