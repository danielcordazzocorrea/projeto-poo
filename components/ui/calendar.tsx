import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarProps = {
  selected?: Date;
  defaultMonth?: Date;
  onSelect?: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
};

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

function startOfDay(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function isSameDay(a: Date | undefined, b: Date): boolean { return !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function isSameMonth(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function addMonths(date: Date, amount: number): Date { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

export const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(({ selected, defaultMonth, onSelect, disabled, className }, ref) => {
  const reducedMotion = useReducedMotion();
  const [month, setMonth] = React.useState(() => new Date((defaultMonth ?? selected ?? new Date()).getFullYear(), (defaultMonth ?? selected ?? new Date()).getMonth(), 1));
  const [view, setView] = React.useState<'days' | 'months' | 'years'>('days');
  const [yearAnchor, setYearAnchor] = React.useState(() => month.getFullYear());
  const [direction, setDirection] = React.useState(1);
  const days = React.useMemo(() => monthGrid(month), [month]);
  const today = startOfDay(new Date());

  function moveMonth(amount: number) {
    setDirection(amount > 0 ? 1 : -1);
    setMonth(current => addMonths(current, amount));
  }

  function chooseMonth(index: number) {
    setDirection(1);
    setMonth(current => new Date(current.getFullYear(), index, 1));
    setView('days');
  }

  function chooseYear(year: number) {
    setDirection(1);
    setMonth(current => new Date(year, current.getMonth(), 1));
    setView('months');
  }

  return <div ref={ref} className={cn('w-[min(300px,calc(100vw-3rem))] select-none rounded-2xl border border-[#30372e] bg-[#121812] p-3 text-[#ecede8] shadow-2xl shadow-black/30', className)}>
    <div className="mb-2 flex items-center justify-between gap-1">
      <button type="button" aria-label="Mês anterior" onClick={() => moveMonth(-1)} className="grid size-8 place-items-center rounded-lg text-[#a2b1a6] transition hover:bg-[#253726] hover:text-[#ecede8] focus-visible:outline-2 focus-visible:outline-[#9dff3a]"><ChevronLeft size={17} /></button>
      <div className="flex items-center gap-1 text-[13px] font-medium">
        <button type="button" onClick={() => setView('months')} className="rounded-lg px-2 py-1 transition hover:bg-[#253726] focus-visible:outline-2 focus-visible:outline-[#9dff3a]">{MONTHS[month.getMonth()]}</button>
        <button type="button" onClick={() => { setYearAnchor(month.getFullYear()); setView('years'); }} className="rounded-lg px-2 py-1 tabular-nums transition hover:bg-[#253726] focus-visible:outline-2 focus-visible:outline-[#9dff3a]">{month.getFullYear()}</button>
      </div>
      <button type="button" aria-label="Próximo mês" onClick={() => moveMonth(1)} className="grid size-8 place-items-center rounded-lg text-[#a2b1a6] transition hover:bg-[#253726] hover:text-[#ecede8] focus-visible:outline-2 focus-visible:outline-[#9dff3a]"><ChevronRight size={17} /></button>
    </div>

    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        {view === 'days' && <motion.div key={`${month.getFullYear()}-${month.getMonth()}`} custom={direction} initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * 12 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * -12 }} transition={{ duration: reducedMotion ? 0.12 : 0.18, ease: EASE_OUT }}>
          <div className="mb-1 grid grid-cols-7">{WEEKDAYS.map(day => <span key={day} className="grid h-7 place-items-center text-[10px] font-medium text-[#a2b1a6]">{day}</span>)}</div>
          <div role="grid" aria-label={`${MONTHS[month.getMonth()]} de ${month.getFullYear()}`} className="grid grid-cols-7 gap-y-0.5">
            {days.map(day => {
              const unavailable = disabled?.(day) ?? false;
              const outside = !isSameMonth(day, month);
              const isSelected = isSameDay(selected, day);
              const isToday = isSameDay(today, day);
              return <button key={day.toISOString()} type="button" disabled={unavailable} aria-pressed={isSelected} onClick={() => onSelect?.(isSelected ? undefined : day)} className={cn('relative grid size-8 place-items-center rounded-full text-[13px] tabular-nums transition focus-visible:outline-2 focus-visible:outline-[#9dff3a]', outside ? 'text-[#a2b1a6]/35' : 'text-[#ecede8]', !unavailable && !isSelected && 'hover:bg-[#253726]', isSelected && 'bg-[#9dff3a] font-semibold text-[#0c0d0c]', isToday && !isSelected && 'border border-[#55715e] font-semibold', unavailable && 'cursor-not-allowed opacity-25')}>{day.getDate()}</button>;
            })}
          </div>
        </motion.div>}

        {view === 'months' && <motion.div key="months" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0.12 : 0.16, ease: EASE_OUT }} className="grid grid-cols-3 gap-1 py-1">
          {MONTHS.map((name, index) => <button key={name} type="button" onClick={() => chooseMonth(index)} className={cn('h-10 rounded-lg text-[13px] transition hover:bg-[#253726] focus-visible:outline-2 focus-visible:outline-[#9dff3a]', index === month.getMonth() && 'bg-[#9dff3a] font-medium text-[#0c0d0c]')}>{name.slice(0, 3)}</button>)}
        </motion.div>}

        {view === 'years' && <motion.div key="years" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0.12 : 0.16, ease: EASE_OUT }}>
          <div className="mb-1 flex items-center justify-between px-0.5"><button type="button" aria-label="Anos anteriores" onClick={() => setYearAnchor(value => value - 12)} className="grid size-8 place-items-center rounded-lg text-[#a2b1a6] transition hover:bg-[#253726] focus-visible:outline-2 focus-visible:outline-[#9dff3a]"><ChevronLeft size={17} /></button><span className="text-[11px] text-[#a2b1a6]">{yearAnchor - 5}–{yearAnchor + 6}</span><button type="button" aria-label="Próximos anos" onClick={() => setYearAnchor(value => value + 12)} className="grid size-8 place-items-center rounded-lg text-[#a2b1a6] transition hover:bg-[#253726] focus-visible:outline-2 focus-visible:outline-[#9dff3a]"><ChevronRight size={17} /></button></div>
          <div className="grid grid-cols-3 gap-1 py-1">{Array.from({ length: 12 }, (_, index) => yearAnchor - 5 + index).map(year => <button key={year} type="button" onClick={() => chooseYear(year)} className={cn('h-10 rounded-lg text-[13px] tabular-nums transition hover:bg-[#253726] focus-visible:outline-2 focus-visible:outline-[#9dff3a]', year === month.getFullYear() && 'bg-[#9dff3a] font-medium text-[#0c0d0c]')}>{year}</button>)}</div>
        </motion.div>}
      </AnimatePresence>
    </div>
  </div>;
});

Calendar.displayName = 'Calendar';
