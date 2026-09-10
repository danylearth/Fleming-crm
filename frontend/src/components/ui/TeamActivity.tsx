import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { GlassCard, Select } from './index';
type Activity = { next_offset: number | null; usage: { today_minutes: number; week_daily_average: string; month_daily_average: string; tracked_since: string | null }; pages: { minute: string; page: string }[]; changes: { id: number; action: string; entity_type: string; entity_id: number; changes: unknown; created_at: string }[] };
export default function TeamActivity({ users }: { users: { id: number; name: string }[] }) {
  const api = useApi();
  const [selected, setSelected] = useState('');
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    if (selected) api.get(`/api/users/${selected}/activity`).then(d => { if (current) setData(d); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [api, selected]);
  return <GlassCard className="p-6 space-y-4"><h2 className="font-semibold">Team Activity</h2><Select label="Team Member" value={selected} onChange={value => { setData(null); setError(''); setSelected(value); }} options={[{ value: '', label: 'Choose a team member' }, ...users.map(u => ({ value: String(u.id), label: u.name }))]} />
    <p className="text-xs text-[var(--text-muted)]">Active minutes count visible CRM use with recent keyboard, pointer or touch activity. Seven- and thirty-day figures are daily averages, including inactive days. Tracking starts with this release.</p>{error && <p role="alert">{error}</p>}
    {data && <><div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[['Today',data.usage.today_minutes],['7-day daily average',data.usage.week_daily_average],['30-day daily average',data.usage.month_daily_average]].map(([label,value]) => <div key={label} className="rounded-xl bg-[var(--bg-hover)] p-3"><p className="text-xs">{label}</p><p className="text-xl font-semibold">{value} min</p></div>)}</div>
      <details><summary className="cursor-pointer font-medium">Recent Pages ({data.pages.length})</summary><div className="max-h-64 overflow-auto text-sm space-y-2 mt-3">{data.pages.map(p => <p key={p.minute}>{new Date(p.minute).toLocaleString('en-GB')} · {p.page}</p>)}{!data.pages.length && <p>No recorded activity yet.</p>}</div></details>
      <details><summary className="cursor-pointer font-medium">Audit History — {data.changes.length} events loaded</summary><div className="max-h-96 overflow-auto text-sm space-y-3 mt-3">{data.changes.map(c => <details key={c.id}><summary className="cursor-pointer">{new Date(c.created_at).toLocaleString('en-GB')} · {c.action} · {c.entity_type} #{c.entity_id}</summary><pre className="whitespace-pre-wrap break-words text-xs mt-2">{JSON.stringify(c.changes,null,2)}</pre></details>)}{!data.changes.length && <p>No changes recorded.</p>}{data.next_offset !== null && <button className="rounded-lg border px-3 py-2" onClick={async () => { try { const more: Activity = await api.get(`/api/users/${selected}/activity?offset=${data.next_offset}`); setData({ ...more, changes: [...data.changes, ...more.changes] }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load older activity'); } }}>Load Older Activity</button>}</div></details></>}
  </GlassCard>;
}
