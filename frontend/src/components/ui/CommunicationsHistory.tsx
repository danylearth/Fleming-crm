import { useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import { Button, GlassCard, SectionHeader } from './index';
import EmailPreviewModal from './EmailPreviewModal';

export interface Communication {
  id: number | string; channel: 'email' | 'sms'; direction?: string;
  recipient?: string | null; sender?: string | null; subject?: string | null;
  body?: string | null; status?: string; error_message?: string | null;
  opened_at?: string | null; clicked_at?: string | null; created_at: string;
}
function emailPlainText(html?: string | null): string {
  const document = new DOMParser().parseFromString(html || '', 'text/html');
  document.querySelectorAll('style,script,head').forEach(element => element.remove());
  document.querySelectorAll('br,p,div,tr').forEach(element => element.append(' '));
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim();
}
export default function CommunicationsHistory({ messages }: { messages: Communication[] }) {
  const [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState<Communication | null>(null);
  const filtered = [...messages].filter(message => filter === 'all' || message.channel === filter)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return <GlassCard className="p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SectionHeader title="Communications" icon={<Mail size={16} />} />
      <div role="group" aria-label="Filter communications" className="flex gap-2">{(['all','email','sms'] as const).map(channel => <button key={channel} aria-pressed={filter===channel} onClick={()=>setFilter(channel)} className={`rounded-full border px-4 py-2 text-xs ${filter===channel?'bg-[#dc006d] text-white border-transparent':'border-[var(--border-input)] text-[var(--text-secondary)]'}`}>{channel==='all'?'All':channel==='email'?'Email':'SMS'}</button>)}</div>
    </div>
    <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
      {!filtered.length && <p className="text-xs text-[var(--text-muted)]">No messages recorded.</p>}
      {filtered.map(message => <div key={`${message.channel}-${message.id}`} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-orange)]">
            {message.channel === 'email' ? <Mail size={12} /> : <MessageSquare size={12} />}{message.channel === 'email' ? 'Email' : 'SMS'} · {message.direction === 'inbound' ? 'Received' : 'Sent'}
          </p><p className="mt-1 text-sm font-medium break-words">{message.subject || (message.channel === 'sms' ? 'Text message' : 'Email')}</p>
          <p className="text-xs text-[var(--text-muted)] break-all">{message.direction === 'inbound' ? message.sender : message.recipient}</p></div>
          <span className="text-[10px] capitalize text-[var(--text-muted)]">{message.status || 'Recorded'}</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--text-secondary)] line-clamp-4">{message.channel === 'email' ? emailPlainText(message.body) || 'Email body unavailable.' : message.body || 'Message body unavailable.'}</p>
        {message.error_message && <p className="mt-2 text-xs text-red-400">{message.error_message}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-[var(--text-muted)]">{new Date(message.created_at).toLocaleString('en-GB')}{message.opened_at ? ' · Open recorded' : ''}{message.clicked_at ? ' · Link clicked' : ''}</p>
          {message.channel === 'email' && message.body && <Button size="sm" variant="ghost" onClick={() => setPreview(message)}>View Email</Button>}
        </div>
      </div>)}
    </div>
    {preview && <EmailPreviewModal open previewOnly onClose={() => setPreview(null)} onSend={async () => {}} to={preview.recipient || ''} from={preview.sender || ''} initialSubject={preview.subject || 'Email'} initialBodyHtml={preview.body || ''} />}
  </GlassCard>;
}
