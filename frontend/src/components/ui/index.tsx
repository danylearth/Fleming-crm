import {PHONE_PLACEHOLDER,normaliseUkPhone} from '../../utils/phone';
import { type ReactNode, useState, useRef, useEffect, useId } from 'react';
import { Eye, EyeOff, Check } from 'lucide-react';
import FloatingDropdown from '../FloatingDropdown';

export function AdministratorAccessBadge() {
  return <span className="inline-flex rounded-full px-5 py-2.5 text-sm font-bold bg-purple-500/10 text-[var(--text-primary)] border border-purple-500/20">Administrator Access Only</span>;
}

// ─── Card ───
export function Card({ children, className = '', onClick, hover }: {
  children: ReactNode; className?: string; onClick?: () => void; hover?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] ${hover ? 'hover:border-[var(--border-input)] hover:brightness-110 cursor-pointer transition-all' : ''
        } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Glass Card (gradient shine) ───
export function GlassCard({ children, className = '', onClick, onMouseEnter, onMouseLeave }: {
  children: ReactNode; className?: string; onClick?: () => void;
  onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`bg-gradient-to-br from-[var(--glass-from)] to-[var(--glass-to)] rounded-2xl border border-[var(--border-color)] backdrop-blur-sm ${onClick ? 'cursor-pointer hover:border-[var(--border-input)] transition-all' : ''
        } ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Button ───
export function Button({ children, onClick, variant = 'primary', size = 'md', className = '', disabled, type = 'button' }: {
  children: ReactNode; onClick?: (e?: React.MouseEvent) => void; variant?: 'primary' | 'ghost' | 'gradient' | 'outline';
  size?: 'sm' | 'md' | 'lg'; className?: string; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const base = 'inline-flex items-center justify-center font-medium transition-all rounded-full';
  const sizes = { sm: 'px-4 py-1.5 text-xs', md: 'px-6 py-2.5 text-sm', lg: 'px-8 py-3 text-base' };
  const variants = {
    primary: 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-90',
    ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
    gradient: 'bg-gradient-to-r from-orange-500 to-pink-500 text-[var(--text-primary)] hover:opacity-90',
    outline: 'border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}>
      {children}
    </button>
  );
}

// Consistent compact actions across list-page import/add toolbars.
export function ToolbarButton(props: Parameters<typeof Button>[0]) {
  return <Button {...props} size="sm" className={`!h-9 !px-4 !py-1.5 !text-xs [&_svg]:!w-3.5 [&_svg]:!h-3.5 ${props.className||''}`} />;
}

// ─── Input ───
export function Input({ label, value, onChange, placeholder, type = 'text', className = '' }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; className?: string;
}) {
  const [showPassword,setShowPassword]=useState(false);
  const phone = type==='tel'||/phone|mobile|contact number/i.test(label||'');
  const currency = type === 'currency';
  const shown = currency ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : value;
  const shouldCap = !currency && !['email', 'number', 'password', 'time', 'tel'].includes(type);
  const handleChange = (raw: string) => {
    if (currency) { const numeric = raw.replace(/[£,\s]/g, ''); if (/^\d*(\.\d{0,2})?$/.test(numeric)) onChange(numeric); return; }
    if (shouldCap && raw.length > 0 && (value.length === 0 || raw.length === 1)) {
      onChange(raw.charAt(0).toUpperCase() + raw.slice(1));
    } else {
      onChange(raw);
    }
  };
  return (
    <div className={className}>
      {label && <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">{label}</label>}
      <div className="relative">{currency && <span className="absolute left-3 top-2.5 text-sm" aria-hidden="true">£</span>}<input aria-label={label} type={phone?'tel':currency || (type==='password'&&showPassword) ? 'text' : type} inputMode={currency ? 'decimal' : undefined} style={currency ? {paddingLeft:28} : undefined} value={shown} onChange={e => handleChange(e.target.value)} placeholder={phone?PHONE_PLACEHOLDER:placeholder} onFocus={()=>{if(phone&&!value)onChange('+44');}} onBlur={()=>{if(phone)onChange(value==='+44'?'':normaliseUkPhone(value));}}
        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors" />{type==='password'&&<button type="button" className="mt-2 flex items-center gap-2 text-xs" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={14}/>:<Eye size={14}/>} {showPassword?'Hide Password':'Show Password'}</button>}</div>
    </div>
  );
}

// ─── Select ───
export function Select({ label, value, onChange, options, className = '', searchable, inlineLabel = false, hideLabel = false, icon, compact = false, disabled = false }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string; className?:string }[]; className?: string; searchable?: boolean; inlineLabel?: boolean; hideLabel?: boolean; icon?: ReactNode; compact?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find(o => o.value === value);
  const showSearch = searchable === true || (searchable !== false && options.length > 5);
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  useEffect(() => {
    if (open && showSearch && searchRef.current) searchRef.current.focus();
    else if(open&&compact) (menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') || menuRef.current?.querySelector<HTMLButtonElement>('[role="option"]'))?.focus();
  }, [open, showSearch, compact]);

  const dropdown = open ? <FloatingDropdown anchor={triggerRef} onClose={()=>{setOpen(false);setSearch('');}}>
      {showSearch && (
        <div className="p-2 border-b border-[var(--border-subtle)]">
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." className="w-full bg-[var(--bg-hover)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none" />
        </div>
      )}
      <div ref={menuRef} id={menuId} role={compact?'listbox':undefined} aria-label={compact?label:undefined} className={compact?'max-h-64 overflow-y-auto p-1.5 space-y-0.5':'max-h-56 overflow-y-auto py-1'} onKeyDown={event=>{
        if(!compact)return;
        if(event.key==='Escape'){event.preventDefault();setOpen(false);triggerRef.current?.focus();return;}
        const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
        const index=items.indexOf(document.activeElement as HTMLButtonElement);
        const next=event.key==='ArrowDown'?(index+1)%items.length:event.key==='ArrowUp'?(index-1+items.length)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:-1;
        if(next>=0){event.preventDefault();items[next]?.focus();}
      }} onBlur={event=>{if(compact&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
        {filtered.map(o => (
          <button
            key={o.value}
            type="button"
            role={compact?'option':undefined}
            aria-selected={compact?value===o.value:undefined}
            tabIndex={compact?-1:undefined}
            onClick={() => { if(!compact||o.value!==value)onChange(o.value); setOpen(false); setSearch(''); if(compact)triggerRef.current?.focus(); }}
            className={compact ? `w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400 ${value===o.value?'bg-purple-500/10 text-[var(--text-primary)] font-medium':'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}` : `w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[var(--bg-hover)] ${
              value === o.value ? 'text-[var(--text-primary)] bg-[var(--bg-hover)] font-medium' : 'text-[var(--text-secondary)]'
            }`}
          >
            <span className={`flex-1 ${o.className||''} ${o.className?'rounded-lg px-2 py-1':''}`}>{o.label}</span>{compact&&<span className="w-4 shrink-0">{value===o.value&&<Check size={15} className="text-purple-500"/>}</span>}
          </button>
        ))}
        {filtered.length === 0 && <p className="px-4 py-2 text-xs text-[var(--text-muted)]">No results</p>}
      </div>
    </FloatingDropdown> : null;

  return (
    <div className={`${inlineLabel ? 'flex items-center gap-3' : ''} ${className}`}>
      {label && !hideLabel && <label className={`text-xs text-[var(--text-secondary)] font-medium ${inlineLabel ? 'shrink-0' : 'block mb-1.5'}`}>{label}</label>}
      <button
        ref={triggerRef}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup={compact?"listbox":undefined}
        aria-controls={open?menuId:undefined}
        disabled={disabled}
        onKeyDown={event=>{if(compact&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();setOpen(true);}}}
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-3 border rounded-xl text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${compact ? "bg-[var(--bg-card)] border-[var(--border-input)] px-3 py-2 text-[13px] shadow-sm hover:border-purple-400" : "bg-[var(--bg-input)] border-[var(--border-input)] px-4 py-2.5 text-sm focus:border-[var(--accent)]"}`}
      >
        <span className={`flex items-center gap-2 min-w-0 ${selected ? '' : 'text-[var(--text-muted)]'}`}>{icon}<span className={selected?.className?`rounded-lg px-2 py-1 ${selected.className}`:undefined}>{selected?.label || 'Select...'}</span></span>
        <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return { value, label };
});

export function TimePicker({ label, value, onChange, className = '' }: {
  label?: string; value: string; onChange: (v: string) => void; className?: string;
}) {
  return <Select label={label} value={value} onChange={onChange} options={TIME_OPTIONS} searchable={false} className={className} />;
}

// ─── Tag ───
export function Tag({ children, active, onClick }: {
  children: ReactNode; active?: boolean; onClick?: () => void;
}) {
  return (
    <span onClick={onClick}
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${active
        ? 'bg-[var(--text-primary)] text-[var(--bg-page)] border-[var(--text-primary)]'
        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
        } ${onClick ? 'cursor-pointer' : ''}`}>
      {children}
    </span>
  );
}

// ─── Avatar ───
export function Avatar({ name, initials, src, size = 'md', className = '' }: {
  name?: string; initials?: string; src?: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string;
}) {
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg', xl: 'w-20 h-20 text-2xl' };
  if (src) {
    return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover ${className}`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center font-bold text-white shrink-0 ${className}`}>
      <span>{initials || name?.[0]?.toUpperCase() || '?'}</span>
    </div>
  );
}

// ─── Status Dot ───
export function StatusDot({ status, size = 'sm' }: { status: 'active' | 'inactive' | 'warning' | 'error'; size?: 'sm' | 'md' }) {
  const colors = { active: 'bg-emerald-400', inactive: 'bg-[var(--text-muted)]', warning: 'bg-amber-400', error: 'bg-red-400' };
  const sizes = { sm: 'w-2 h-2', md: 'w-3 h-3' };
  return <span className={`${sizes[size]} ${colors[status]} rounded-full inline-block`} />;
}

// ─── Progress Ring ───
export function ProgressRing({ value, size = 64, strokeWidth = 5, gradient = true, label }: {
  value: number; size?: number; strokeWidth?: number; gradient?: boolean; label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const [gradientId] = useState(() => `ring-${Math.random().toString(36).slice(2)}`);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth={strokeWidth} />
          {gradient && (
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          )}
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={gradient ? `url(#${gradientId})` : '#ec4899'}
            strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-500" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{value}%</span>
      </div>
      {label && <span className="text-[11px] text-[var(--text-secondary)] font-medium uppercase tracking-wide">{label}</span>}
    </div>
  );
}

// ─── Section Header ───
export function SectionHeader({ title, icon, action, actionLabel }: {
  title: string; icon?: ReactNode; action?: () => void; actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">{icon}{title}</h3>
      {action && actionLabel && (
        <Button variant="outline" size="sm" onClick={action}>{actionLabel}</Button>
      )}
    </div>
  );
}

// ─── Empty State ───
export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
      {icon && <div className="mb-3 text-[var(--text-faint)]">{icon}</div>}
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Search Bar ───
export function SearchBar({ value, onChange, placeholder = 'Search...' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl pl-11 pr-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors" />
    </div>
  );
}

// ─── DataTable (re-export) ───
export { DataTable } from './DataTable';
export type { Column } from './DataTable';

// ─── SearchDropdown (re-export) ───
export { SearchDropdown } from './SearchDropdown';
export type { DropdownOption } from './SearchDropdown';

// ─── DatePicker (re-export) ───
export { DatePicker } from './DatePicker';

// ─── Government API Components (re-export) ───
export { default as PricePaidData } from './PricePaidData';
export { default as PostcodeAutocomplete } from './PostcodeAutocomplete';
export { default as CompaniesHouseLookup } from './CompaniesHouseLookup';
