import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Copy, FileSignature, Grip, Type, X } from 'lucide-react';
import { Button, Select } from './ui';
import type { Field } from './SignatureRequests';

type Kind = 'signature' | 'initials' | 'date';
const labels = { signature: 'Signature', initials: 'Initials', date: 'Date' };
const sizes = { signature: [.24, .065], initials: [.10, .045], date: [.16, .035] };
const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));
const recipientColours = ['#be185d', '#15803d', '#1d4ed8', '#7e22ce', '#b45309', '#0e7490', '#c2410c', '#4338ca', '#4d7c0f', '#a21caf'];
export default function SignatureFieldEditor({ recipients, fields, onChange, page, onPage, pageCount, signer, onSigner, renderPage, onClose, onSave }: {
  recipients: { id: number; name: string }[]; fields: Field[]; onChange: (fields: Field[]) => void;
  page: number; onPage: (page: number) => void; pageCount: number; signer: string; onSigner: (id: string) => void;
  renderPage: (children: ReactNode) => ReactNode; onClose: () => void; onSave: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null), surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ index: number; resize: boolean; x: number; y: number; width: number; height: number; original: Field } | null>(null);
  const [kind, setKind] = useState<Kind>('signature'), [selected, setSelected] = useState<number | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  const update = (index: number, field: Field) => onChange(fields.map((old, i) => i === index ? field : old));
  const colour = (id: number) => recipientColours[Math.max(0, recipients.findIndex(person => person.id === id)) % recipientColours.length];
  const focusField = (index: number) => requestAnimationFrame(() => surface.current?.querySelector<HTMLElement>(`[data-field-index="${index}"]`)?.focus({ preventScroll: true }));
  const duplicate = (index: number) => {
    if (fields.length >= 100) return;
    const field = fields[index];
    onChange([...fields, { ...field, x: clamp(field.x + .02, 1 - field.width), y: clamp(field.y + field.height + .01, 1 - field.height) }]);
    setSelected(fields.length); focusField(fields.length);
  };
  const add = (x: number, y: number, type = kind) => {
    if (!signer || fields.length >= 100) return;
    const [width, height] = sizes[type];
    onChange([...fields, { type, recipient_id: Number(signer), page, x: clamp(x, 1 - width), y: clamp(y, 1 - height), width, height }]);
    setSelected(fields.length); focusField(fields.length);
  };
  const start = (event: PointerEvent<HTMLDivElement | HTMLButtonElement>, index: number, resize = false) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    surface.current?.querySelector<HTMLElement>(`[data-field-index="${index}"]`)?.focus({ preventScroll: true });
    const box = surface.current!.getBoundingClientRect();
    gesture.current = { index, resize, x: event.clientX, y: event.clientY, width: box.width, height: box.height, original: fields[index] };
    setSelected(index); onSigner(String(fields[index].recipient_id));
  };
  const move = (event: PointerEvent) => {
    const current = gesture.current; if (!current) return;
    const { index, original: field, resize } = current, dx = (event.clientX - current.x) / current.width, dy = (event.clientY - current.y) / current.height;
    update(index, resize ? { ...field, width: Math.max(.06, Math.min(field.width + dx, 1 - field.x)), height: Math.max(.025, Math.min(field.height + dy, 1 - field.y)) }
      : { ...field, x: clamp(field.x + dx, 1 - field.width), y: clamp(field.y + dy, 1 - field.height) });
  };
  const keyboard = (event: KeyboardEvent, index: number) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); event.stopPropagation(); duplicate(index); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (['Delete', 'Backspace'].includes(event.key)) { onChange(fields.filter((_, i) => i !== index)); setSelected(null); return; }
    const field = fields[index], dx = event.key === 'ArrowLeft' ? -.005 : event.key === 'ArrowRight' ? .005 : 0, dy = event.key === 'ArrowUp' ? -.005 : event.key === 'ArrowDown' ? .005 : 0;
    update(index, event.shiftKey ? { ...field, width: Math.max(.06, Math.min(field.width + dx, 1 - field.x)), height: Math.max(.025, Math.min(field.height + dy, 1 - field.y)) }
      : { ...field, x: clamp(field.x + dx, 1 - field.width), y: clamp(field.y + dy, 1 - field.height) });
  };
  return createPortal(<dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-label="Place signing fields" className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-6xl h-[92vh] p-0 rounded-2xl border border-[var(--border-input)] bg-[var(--bg-card)] text-[var(--text-primary)] backdrop:bg-black/50">
    <div className="flex flex-col h-full">
      <header className="shrink-0 p-4 border-b border-[var(--border-subtle)] space-y-3">
        <div className="flex justify-between items-center"><h2 className="text-lg font-semibold flex items-center gap-2"><FileSignature size={20}/>Place Signing Fields</h2><button aria-label="Close field editor" disabled={busy} onClick={onClose}><X size={20}/></button></div>
        <div className="flex flex-wrap items-end gap-3">
          <Select className="min-w-56 flex-1" label="Recipient" value={signer} onChange={onSigner} options={recipients.map(person => ({ value: String(person.id), label: person.name }))}/>
          <div className="flex gap-2" aria-label="Field types">{(['signature', 'initials', 'date'] as Kind[]).map(type => {
            const Icon = type === 'signature' ? FileSignature : type === 'initials' ? Type : Calendar;
            return <button key={type} type="button" aria-pressed={kind === type} draggable onDragStart={event => { setKind(type); event.dataTransfer.setData('application/x-signing-field', type); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => setKind(type)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-3 text-sm ${kind === type ? 'border-pink-500 bg-pink-500/10' : 'border-[var(--border-input)]'}`}><Icon size={16}/>{labels[type]}</button>;
          })}</div>
          <Select className="w-36" label="Page" value={String(page)} onChange={value => { onPage(Number(value)); setSelected(null); }} options={Array.from({ length: pageCount }, (_, i) => ({ value: String(i), label: `${i + 1} of ${pageCount}` }))}/>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Recipient colours">{recipients.map(person => <span key={person.id} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colour(person.id) }}/>{person.name}</span>)}</div>
        <p className="text-xs text-[var(--text-muted)]">Choose a field type, then click its position on the document, or drag it onto the page. Click an existing field to move it; Shift + arrows resize it. Use Duplicate or Ctrl + D to copy its size.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg-subtle)] p-4">
        <div ref={surface} className="relative mx-auto max-w-4xl" onClick={event => {
          if (!(event.target instanceof HTMLImageElement) || !event.target.complete || !event.target.naturalWidth) return;
          const box = event.currentTarget.getBoundingClientRect();
          add((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
        }} onDragOver={event => { if (event.dataTransfer.types.includes('application/x-signing-field')) event.preventDefault(); }} onDrop={event => { const type = event.dataTransfer.getData('application/x-signing-field') as Kind; if (!(type in labels) || !surface.current?.querySelector('img')?.naturalWidth) return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); add((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, type); }}>
          {renderPage(fields.map((field, index) => field.page !== page ? null : <div key={index} data-field-index={index} tabIndex={0} role="group" aria-label={`${labels[field.type || 'signature']} for ${recipients.find(person => person.id === field.recipient_id)?.name}`} onFocus={() => { setSelected(index); onSigner(String(field.recipient_id)); }} onKeyDown={event => keyboard(event, index)} onPointerDown={event => start(event, index)} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} className="absolute flex items-center justify-center cursor-move touch-none select-none rounded-md border-2 outline-none" style={{ color: colour(field.recipient_id), borderColor: colour(field.recipient_id), backgroundColor: colour(field.recipient_id) + '22', boxShadow: selected === index ? `0 0 0 3px ${colour(field.recipient_id)}44` : undefined, left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }}>
            <span className="px-2 text-xs truncate pointer-events-none"><strong>{labels[field.type || 'signature']}</strong><span className="block truncate">{recipients.find(person => person.id === field.recipient_id)?.name}</span></span>
            {selected === index && <><button aria-label="Duplicate field" title="Duplicate field (Ctrl + D)" disabled={fields.length >= 100} className="absolute right-6 -top-2 bg-white border rounded-full p-1" onPointerDown={event => event.stopPropagation()} onClick={() => duplicate(index)}><Copy size={12}/></button><button aria-label="Remove field" className="absolute -right-2 -top-2 bg-white border rounded-full p-1" onPointerDown={event => event.stopPropagation()} onClick={() => { onChange(fields.filter((_, i) => i !== index)); setSelected(null); }}><X size={12}/></button><button aria-label="Resize field" className="absolute bottom-0 right-0 p-1 cursor-se-resize touch-none" onPointerDown={event => start(event, index, true)} onPointerMove={move} onPointerUp={() => { gesture.current = null; }}><Grip size={14}/></button></>}
          </div>))}
        </div>
      </div>
      <footer className="shrink-0 p-4 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3"><p role={error ? 'alert' : undefined} className={error ? 'text-sm text-red-600' : 'text-sm text-[var(--text-muted)]'}>{error || `${fields.length} fields placed`}</p><Button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onSave(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save fields'); } finally { setBusy(false); } }}>{busy ? 'Saving…' : 'Save Fields'}</Button></footer>
    </div>
  </dialog>, document.body);
}
