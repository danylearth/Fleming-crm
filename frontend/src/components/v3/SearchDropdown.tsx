import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface DropdownOption {
    id: number;
    label: string;
    subtitle?: string;
}

interface SearchDropdownProps {
    icon: ReactNode;
    placeholder: string;
    options: DropdownOption[];
    value: number | null;
    onChange: (id: number | null) => void;
    searchPlaceholder?: string;
}

export function SearchDropdown({
    icon, placeholder, options, value, onChange, searchPlaceholder,
}: SearchDropdownProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = options.find(o => o.id === value);
    const filtered = options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.subtitle || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors whitespace-nowrap ${value
                    ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--text-primary)]'
                    : 'bg-[var(--bg-input)] border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
            >
                {icon}
                {selected ? selected.label : placeholder}
                {value ? (
                    <X size={12} className="ml-1 hover:text-red-400" onClick={(e) => { e.stopPropagation(); onChange(null); }} />
                ) : (
                    <ChevronDown size={12} />
                )}
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl z-[9999] overflow-hidden">
                    <div className="p-2">
                        <input
                            type="text"
                            placeholder={searchPlaceholder || `Search...`}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                            autoFocus
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        <button
                            onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors ${!value ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'
                                }`}
                        >
                            All
                        </button>
                        {filtered.map(o => (
                            <button
                                key={o.id}
                                onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors ${value === o.id ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'
                                    }`}
                            >
                                <p className="truncate">{o.label}</p>
                                {o.subtitle && <p className="text-xs text-[var(--text-muted)]">{o.subtitle}</p>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
