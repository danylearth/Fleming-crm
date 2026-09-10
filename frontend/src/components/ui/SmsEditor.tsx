import { useState } from 'react';
import { calculateSmsSegments } from '../../utils/sms';
export default function SmsEditor({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [editing,setEditing]=useState(false);const segments=calculateSmsSegments(value);
  return <div className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-2"><div className="flex justify-between items-center"><span className="text-xs font-semibold">SMS Preview</span><button type="button" onClick={()=>setEditing(!editing)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">{editing?'Done':'Edit SMS'}</button></div>{editing?<textarea aria-label="SMS message" value={value} onChange={e=>onChange(e.target.value)} maxLength={1600} rows={5} className="w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-input)] p-3 text-sm leading-6"/>:<p className="text-sm leading-6 whitespace-pre-wrap break-words">{value}</p>}<p className="text-[10px] text-[var(--text-muted)]">{segments.charCount} characters · {segments.segments} segments</p></div>;
}
