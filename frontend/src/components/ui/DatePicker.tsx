import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DatePickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDisplay(iso: string) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { day: number; current: boolean; iso: string }[] = [];

  for (let i = offset - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    cells.push({ day: d, current: false, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 1 : month + 2;
    const y = month === 11 ? year + 1 : year;
    cells.push({ day: d, current: false, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  return cells;
}

export function DatePicker({ label, value, onChange, placeholder = 'DD/MM/YYYY', className = '' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [yearPicker, setYearPicker] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [draft, setDraft] = useState(formatDisplay(value));

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const initial = value ? new Date(value) : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    setDraft(formatDisplay(value));
  }, [value]);

  const parseTypedDate = (typed: string) => {
    const match = typed.trim().match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
    if (!match) return null;
    const [, first, monthPart, last] = match;
    const year = first.length === 4 ? Number(first) : Number(last);
    const month = Number(monthPart);
    const day = first.length === 4 ? Number(last) : Number(first);
    const parsed = new Date(year, month - 1, day);
    if (
      year < 1000 || month < 1 || month > 12 || day < 1 ||
      parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day
    ) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const handleTypedChange = (typed: string) => {
    setDraft(typed);
    if (!typed.trim()) {
      onChange('');
      return;
    }
    const iso = parseTypedDate(typed);
    if (iso) onChange(iso);
  };

  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      const height = dropdownRef.current?.offsetHeight || 350;
      const below = rect.bottom + 4;
      const top = below + height <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - height - 4);
      setPos({ top, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width });
    }
  }, []);

  const handleToggleOpen = () => {
    const nextOpen = !open;
    if (nextOpen) {
      if (value) {
        const d = new Date(value);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
      updatePos();
      setYearPicker(false);
    }
    setOpen(nextOpen);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, yearPicker, updatePos]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells = getMonthDays(viewYear, viewMonth);

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      className="crm-workspace fixed bg-[var(--bg-card)] text-[var(--text-primary)] font-[family-name:var(--user-font)] border border-[var(--border-input)] rounded-xl shadow-2xl p-3"
      role="dialog"
      aria-label="Choose date"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', zIndex: 9999 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" aria-label="Previous month" onClick={prevMonth} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Choose month and year"
          aria-expanded={yearPicker}
          onClick={() => setYearPicker(!yearPicker)}
          className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors px-2 py-0.5 rounded-lg hover:bg-[var(--bg-hover)]"
        >
          {MONTHS[viewMonth]} {viewYear}
        </button>
        <button type="button" aria-label="Next month" onClick={nextMonth} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {yearPicker ? (
        <>
          {/* Year selector */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Previous year" onClick={() => setViewYear(y => y - 1)} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{viewYear}</span>
            <button type="button" aria-label="Next year" onClick={() => setViewYear(y => y + 1)} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                type="button"
                onClick={() => { setViewMonth(i); setYearPicker(false); }}
                className={`py-2 rounded-lg text-xs font-medium transition-colors
                  ${i === viewMonth ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}
                `}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] text-[var(--text-muted)] font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const isSelected = cell.current && cell.iso === value;
              const isToday = cell.current && cell.iso === todayIso;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!cell.current}
                  onClick={() => { if (cell.current) { onChange(cell.iso); setOpen(false); } }}
                  className={`w-9 h-9 rounded-lg text-xs flex items-center justify-center transition-colors
                    ${!cell.current ? 'opacity-50 cursor-default' : ''}
                    ${isSelected ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold' : ''}
                    ${!isSelected && cell.current ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]' : ''}
                    ${isToday && !isSelected ? 'ring-1 ring-[var(--accent)]/50 font-semibold text-[var(--text-primary)]' : ''}
                  `}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => { onChange(todayIso); setOpen(false); setYearPicker(false); }}
          className="text-xs text-[var(--text-primary)] hover:underline"
        >
          Today
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setYearPicker(false); }}
            className="text-xs text-[var(--text-muted)] hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative ${className}`}>
      {label && <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">{label}</label>}
      <div
        ref={triggerRef}
        className="w-full flex items-center bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl focus-within:border-[var(--accent)] transition-colors"
      >
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={e => handleTypedChange(e.target.value)}
          onClick={() => { if (!open) handleToggleOpen(); }}
          onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) handleToggleOpen(); } if (event.key === 'Enter') { event.preventDefault(); const iso=parseTypedDate(draft); if(iso){onChange(iso);setOpen(false);}else if(!open)handleToggleOpen(); } }}
          placeholder={placeholder}
          aria-label={label || placeholder}
          className="min-w-0 flex-1 bg-transparent pl-3 pr-1 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
        />
        <button type="button" onClick={handleToggleOpen} className="shrink-0 px-2 py-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Open calendar">
          <Calendar size={16} />
        </button>
      </div>
      {dropdown}
    </div>
  );
}
