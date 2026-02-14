import { ReactNode } from 'react';

// ─── Card ───
export function Card({ children, className = '', onClick, hover }: {
  children: ReactNode; className?: string; onClick?: () => void; hover?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#232323] rounded-2xl border border-white/[0.08] ${
        hover ? 'hover:border-white/[0.15] hover:brightness-110 cursor-pointer transition-all' : ''
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Glass Card (gradient shine) ───
export function GlassCard({ children, className = '', onClick }: {
  children: ReactNode; className?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-br from-white/[0.06] to-white/[0.02] rounded-2xl border border-white/[0.08] backdrop-blur-sm ${
        onClick ? 'cursor-pointer hover:border-white/[0.15] transition-all' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Button ───
export function Button({ children, onClick, variant = 'primary', size = 'md', className = '', disabled, type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'gradient' | 'outline';
  size?: 'sm' | 'md' | 'lg'; className?: string; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const base = 'inline-flex items-center justify-center font-medium transition-all rounded-full';
  const sizes = { sm: 'px-4 py-1.5 text-xs', md: 'px-6 py-2.5 text-sm', lg: 'px-8 py-3 text-base' };
  const variants = {
    primary: 'bg-white text-black hover:bg-white/90',
    ghost: 'text-white/70 hover:text-white hover:bg-white/[0.06]',
    gradient: 'bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:opacity-90',
    outline: 'border border-white/20 text-white hover:bg-white/[0.06]',
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
  return (
    <div className={className}>
      {label && <label className="block text-xs text-white/50 mb-1.5 font-medium">{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/[0.25] transition-colors" />
    </div>
  );
}

// ─── Select ───
export function Select({ label, value, onChange, options, className = '' }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="block text-xs text-white/50 mb-1.5 font-medium">{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white appearance-none focus:outline-none focus:border-white/[0.25] transition-colors">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Tag ───
export function Tag({ children, active, onClick }: {
  children: ReactNode; active?: boolean; onClick?: () => void;
}) {
  return (
    <span onClick={onClick}
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-white/[0.15] text-white' : 'bg-white/[0.06] text-white/60 hover:text-white/80'
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
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center font-bold shrink-0 ${className}`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

// ─── Status Dot ───
export function StatusDot({ status, size = 'sm' }: { status: 'active' | 'inactive' | 'warning' | 'error'; size?: 'sm' | 'md' }) {
  const colors = { active: 'bg-emerald-400', inactive: 'bg-white/30', warning: 'bg-amber-400', error: 'bg-red-400' };
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
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        {gradient && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        )}
        <circle cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={gradient ? `url(#${gradientId})` : '#ec4899'}
          strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <span className="text-lg font-bold -mt-[calc(50%+8px)] absolute">{value}%</span>
      {label && <span className="text-[11px] text-white/50 font-medium uppercase tracking-wide">{label}</span>}
    </div>
  );
}

// ─── Section Header ───
export function SectionHeader({ title, action, actionLabel }: {
  title: string; action?: () => void; actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      {action && actionLabel && (
        <Button variant="outline" size="sm" onClick={action}>{actionLabel}</Button>
      )}
    </div>
  );
}

// ─── Empty State ───
export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-white/30">
      {icon && <div className="mb-3 text-white/20">{icon}</div>}
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
      <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/[0.2] transition-colors" />
    </div>
  );
}
