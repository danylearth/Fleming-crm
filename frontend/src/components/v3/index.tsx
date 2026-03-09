import { type ReactNode, useState, useRef, useEffect } from 'react';

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
  children: ReactNode; onClick?: (e?: any) => void; variant?: 'primary' | 'ghost' | 'gradient' | 'outline';
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

// ─── Input ───
export function Input({ label, value, onChange, placeholder, type = 'text', className = '' }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; className?: string;
}) {
  const shouldCap = !['email', 'number', 'password', 'time', 'tel'].includes(type);
  const handleChange = (raw: string) => {
    if (shouldCap && raw.length > 0 && (value.length === 0 || raw.length === 1)) {
      onChange(raw.charAt(0).toUpperCase() + raw.slice(1));
    } else {
      onChange(raw);
    }
  };
  return (
    <div className={className}>
      {label && <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">{label}</label>}
      <input type={type} value={value} onChange={e => handleChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors" />
    </div>
  );
}

// ─── Select ───
export function Select({ label, value, onChange, options, className = '' }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={ref}>
      {label && <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors text-left"
      >
        <span className={selected ? '' : 'text-[var(--text-muted)]'}>{selected?.label || 'Select...'}</span>
        <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[var(--bg-hover)] ${
                  value === o.value ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
export function Avatar({ name, src, size = 'md', className = '' }: {
  name?: string; src?: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string;
}) {
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg', xl: 'w-20 h-20 text-2xl' };
  if (src) {
    return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover ${className}`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center font-bold text-white shrink-0 ${className}`}>
      {name?.[0]?.toUpperCase() || '?'}
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
  const gradientId = `ring-${Math.random().toString(36).slice(2)}`;

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
