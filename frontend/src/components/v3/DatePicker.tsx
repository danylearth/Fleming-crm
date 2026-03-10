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
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
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

export function DatePicker({ label, value, onChange, placeholder = 'DD-MM-YYYY', className = '' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [yearPicker, setYearPicker] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const initial = value ? new Date(value) : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
    }
  }, []);

  useEffect(() => {
    if (open && value) {
      const d = new Date(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    if (open) {
      updatePos();
      setYearPicker(false);
    }
  }, [open, value, updatePos]);

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
      className="fixed bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-3"
      style={{ top: pos.top, left: pos.left, width: pos.width, minWidth: 280, zIndex: 9999 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => setYearPicker(!yearPicker)}
          className="text-sm font-medium text-[var(--text-primary)] hover:text-white transition-colors px-2 py-0.5 rounded-lg hover:bg-[var(--bg-hover)]"
        >
          {MONTHS[viewMonth]} {viewYear}
        </button>
        <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {yearPicker ? (
        <>
          {/* Year selector */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setViewYear(y => y - 1)} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{viewYear}</span>
            <button type="button" onClick={() => setViewYear(y => y + 1)} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
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
                    ${!isSelected && cell.current ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white' : ''}
                    ${isToday && !isSelected ? 'ring-1 ring-[var(--accent)]/50 font-semibold text-white' : ''}
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
          className="text-xs text-white hover:underline"
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
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors text-left"
      >
        <span className={value ? '' : 'text-[var(--text-muted)]'}>{value ? formatDisplay(value) : placeholder}</span>
        <Calendar size={16} className="text-[var(--text-muted)]" />
      </button>
      {dropdown}
    </div>
  );
}
