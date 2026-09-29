import ChatTranscript from '../ChatTranscript';
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Clock, Eye, Plus, Pencil, Trash2, LogIn, Upload, StickyNote, MessageSquare, FileUp, ArrowRight, Mail } from 'lucide-react';

interface AuditEntry {
  id: number;
  user_email: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id: number;
  changes: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  property_compliance_saved: {icon:FileUp,color:'text-emerald-400 bg-emerald-500/20',label:'Compliance updated'},
  flemo_document_filed: {icon:FileUp,color:'text-purple-400 bg-purple-500/20',label:'Document filed'},
  flemo_compliance_updated: {icon:Pencil,color:'text-purple-400 bg-purple-500/20',label:'Compliance updated'},
  chat_updated: { icon: MessageSquare, color: 'text-teal-400 bg-teal-500/20', label: 'Chat linked or updated' },
  chat_completed: { icon: MessageSquare, color: 'text-teal-400 bg-teal-500/20', label: 'Chat completed' },
  inventory_exemption: { icon: StickyNote, color: 'text-amber-400 bg-amber-500/20', label: 'Inventory exemption approved' },
  signature_request_sent: { icon: Mail, color: 'text-sky-400 bg-sky-500/20', label: 'Document sent for signature' },
  document_signed: { icon: FileUp, color: 'text-emerald-400 bg-emerald-500/20', label: 'Document signed' },
  view: { icon: Eye, color: 'text-blue-400 bg-blue-500/20', label: 'Viewed' },
  create: { icon: Plus, color: 'text-emerald-400 bg-emerald-500/20', label: 'Created' },
  update: { icon: Pencil, color: 'text-amber-400 bg-amber-500/20', label: 'Updated' },
  delete: { icon: Trash2, color: 'text-red-400 bg-red-500/20', label: 'Deleted' },
  login: { icon: LogIn, color: 'text-purple-400 bg-purple-500/20', label: 'Logged in' },
  export: { icon: Upload, color: 'text-cyan-400 bg-cyan-500/20', label: 'Exported' },
  note_added: { icon: StickyNote, color: 'text-pink-400 bg-pink-500/20', label: 'Note added' },
  sms_received: { icon: MessageSquare, color: 'text-teal-400 bg-teal-500/20', label: 'SMS received' },
  sms_sent: { icon: MessageSquare, color: 'text-teal-400 bg-teal-500/20', label: 'SMS sent' },
  document_upload: { icon: FileUp, color: 'text-orange-400 bg-orange-500/20', label: 'Document uploaded' },
  status_changed: { icon: ArrowRight, color: 'text-indigo-400 bg-indigo-500/20', label: 'Status changed' },
  email_sent: { icon: Mail, color: 'text-sky-400 bg-sky-500/20', label: 'Email sent' },
  bank_details_updated: { icon: Pencil, color: 'text-amber-400 bg-amber-500/20', label: 'Bank details updated' },
  bank_details_approved: { icon: Pencil, color: 'text-emerald-400 bg-emerald-500/20', label: 'Office bank approval · Phone check' },
  service_agreement_override: { icon: Pencil, color: 'text-amber-400 bg-amber-500/20', label: 'Property onboarding override approved' },
  bank_details_confirmed: { icon: Pencil, color: 'text-emerald-400 bg-emerald-500/20', label: 'Bank details confirmed' },
  service_agreement_signed: { icon: FileUp, color: 'text-emerald-400 bg-emerald-500/20', label: 'Service agreement signed' },
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
  const [transcript,setTranscript]=useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh=()=>api.get(`/api/activity/${entityType}/${entityId}?limit=20`)
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => { /* Silently ignore */ })
      .finally(() => setLoading(false));
    void refresh();
    const onActivity=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.entityType===entityType&&detail.entityId===entityId)void refresh();};
    window.addEventListener('crm-activity-updated',onActivity);
    return()=>window.removeEventListener('crm-activity-updated',onActivity);
  }, [entityType, entityId, api]);

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
    <><div className="relative pl-6 pr-2 border-l-2 border-[var(--border-subtle)] space-y-4 max-h-[390px] overflow-y-auto">
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
                {['update','bank_details_updated','bank_details_approved','service_agreement_override','bank_details_confirmed','service_agreement_signed'].includes(entry.action) && entry.changes && <details className="text-xs text-[var(--text-secondary)] mt-1"><summary className="cursor-pointer">View changes</summary><dl className="mt-2 space-y-1">{(()=>{try{return Object.entries(JSON.parse(entry.changes)).filter(([key])=>!key.includes('password')&&!key.includes('token')).map(([key,value])=><div key={key}><dt className="font-medium">{key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</dt><dd className="break-words">{key==='details_approved'&&value===true?entry.user_name||entry.user_email||'Name not recorded':typeof value==='boolean'?(value?'Yes':'No'):typeof value==='object'?JSON.stringify(value):String(value??'Cleared')}</dd></div>);}catch{return null;}})()}</dl></details>}
                {entry.action==='property_compliance_saved'&&entry.changes&&(()=>{try{const c=JSON.parse(entry.changes);const date=(value:string|null)=>value?new Date(value).toLocaleDateString('en-GB'):'Not set';return <div className="mt-1 space-y-1 text-xs text-[var(--text-secondary)]"><p>{c.doc_type} {c.operation==='replaced'?'report replaced':c.operation==='uploaded'?'report uploaded':'expiry updated'}{c.source==='Tenant onboarding'?' during Onboarding · Tenancy Agreement':''}</p><p className="break-words">{c.original_name}</p>{c.expiry_date&&<p>Expiry: {date(c.expiry_date.from)} → {date(c.expiry_date.to)}</p>}{c.enquiry_id&&<p>Enquiry #{c.enquiry_id}</p>}</div>;}catch{return null;}})()}
                {entry.action === 'signature_request_sent' && entry.changes && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{(()=>{try{const c=JSON.parse(entry.changes);return [c.title,Array.isArray(c.recipients)?'Recipients: '+c.recipients.join(', '):''].filter(Boolean).join(' · ');}catch{return '';}})()}</p>}
                {entry.action.startsWith('flemo_')&&entry.changes&&<p className="text-xs text-[var(--text-secondary)] mt-1">{(()=>{try{const c=JSON.parse(entry.changes);return `${c.filename||c.doc_type||''}${entry.action==='flemo_compliance_updated'?` · ${c.before||'Not set'} → ${c.after}`:''}`;}catch{return '';}})()}</p>}
                {entry.action === 'note_added' && entry.changes && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                    {(() => { try { const c = JSON.parse(entry.changes); return c.text || ''; } catch { return ''; } })()}
                  </p>
                )}
                {entry.action === 'sms_sent' && entry.changes && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                    {(() => { try { const c = JSON.parse(entry.changes); return `To: ${c.to_phone || ''}${c.message ? ' — ' + c.message : ''}`; } catch { return ''; } })()}
                  </p>
                )}
                {entry.action === 'document_upload' && entry.changes && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                    {(() => { try { const c = JSON.parse(entry.changes); return `${c.doc_type || 'Document'}${c.original_name ? ' — ' + c.original_name : ''}`; } catch { return ''; } })()}
                  </p>
                )}
                {entry.action === 'status_changed' && entry.changes && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                    {(() => { try { const c = JSON.parse(entry.changes); return `${c.from || '?'} → ${c.to || '?'}`; } catch { return ''; } })()}
                  </p>
                )}
                {entry.action === 'email_sent' && entry.changes && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                    {(() => { try { const c = JSON.parse(entry.changes); return `To: ${c.to || ''}${c.subject ? ' — ' + c.subject : ''}`; } catch { return ''; } })()}
                  </p>
                )}
                {['chat_updated','chat_completed'].includes(entry.action)&&entry.changes&&<button className="text-xs underline mt-1" onClick={()=>{try{setTranscript(JSON.parse(entry.changes!).conversation_id);}catch{/* Invalid historical entry. */}}}>View full chat transcript</button>}
                {entry.action==='inventory_exemption'&&entry.changes&&<p className="text-xs mt-1">{(()=>{try{return JSON.parse(entry.changes).reason;}catch{return '';}})()}</p>}
                <p className="text-[10px] text-[var(--text-muted)]">
                  {entry.user_name || entry.user_email} · {formatDateTime(entry.created_at)} ({timeAgo(entry.created_at)})
                </p>
                {(entry.action.startsWith('flemo_')||entry.entity_type==='flemo_action'||(()=>{try{return JSON.parse(entry.changes||'{}').via==='FlemoAI';}catch{return false;}})())&&<p className="mt-1 text-xs"><span className="inline-block rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 px-2 py-0.5 font-medium">Done by FlemoAI</span><span className="ml-1">· {entry.user_name || entry.user_email}</span></p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>{transcript&&<ChatTranscript conversationId={transcript} onClose={()=>setTranscript(null)}/>}</>
  );
}
