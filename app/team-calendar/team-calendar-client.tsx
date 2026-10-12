'use client';

import { useState, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isWithinInterval,
} from 'date-fns';
import { displayDateRange } from '@/lib/dates';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';

interface CalendarEntry {
  user_id: string;
  display_name: string;
  start_date: string;
  end_date: string;
}

interface TeamCalendarClientProps {
  profile: any;
  initialEntries: CalendarEntry[];
  initialFrom: string;
  initialTo: string;
}

export default function TeamCalendarClient({
  profile,
  initialEntries,
}: TeamCalendarClientProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>(initialEntries);
  const [viewMode, setViewMode] = useState<'list' | 'month'>('list');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const supabase = getSupabaseClient();

  // Load calendar when month changes
  async function fetchMonthData(targetMonth: Date) {
    setLoading(true);
    try {
      const from = format(startOfMonth(targetMonth), 'yyyy-MM-dd');
      const to = format(endOfMonth(targetMonth), 'yyyy-MM-dd');

      const { data, error } = await supabase.rpc('team_calendar', {
        p_from: from,
        p_to: to,
      });

      if (error) {
        clientLogger.error('Failed to load team calendar', error);
      } else {
        setEntries(data ?? []);
      }
    } catch (err) {
      clientLogger.error('Exception loading team calendar', err instanceof Error ? err : undefined);
    } finally {
      setLoading(false);
    }
  }

  function handlePrevMonth() {
    const prev = subMonths(currentMonth, 1);
    setCurrentMonth(prev);
    void fetchMonthData(prev);
  }

  function handleNextMonth() {
    const next = addMonths(currentMonth, 1);
    setCurrentMonth(next);
    void fetchMonthData(next);
  }

  // Days in current month grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [monthStart, monthEnd]);

  // Entries for selected month
  const monthEntries = useMemo(() => {
    return entries.filter((entry) => {
      const start = parseISO(entry.start_date);
      const end = parseISO(entry.end_date);
      return (
        isWithinInterval(start, { start: monthStart, end: monthEnd }) ||
        isWithinInterval(end, { start: monthStart, end: monthEnd }) ||
        (start <= monthStart && end >= monthEnd)
      );
    });
  }, [entries, monthStart, monthEnd]);

  // Day absences mapping
  function getAbsencesForDay(day: Date) {
    return entries.filter((entry) => {
      const start = parseISO(entry.start_date);
      const end = parseISO(entry.end_date);
      return isWithinInterval(day, { start, end });
    });
  }

  return (
    <AppShell profile={profile} activeRoute="/team-calendar">
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Team Calendar</h1>
            <p className="text-sm text-slate-400 mt-1">
              Colleague absences for planning and scheduling
            </p>
          </div>

          {/* View toggle & month nav */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                id="toggle-view-list"
              >
                List View
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  viewMode === 'month'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                id="toggle-view-month"
              >
                Month Grid
              </button>
            </div>
          </div>
        </div>

        {/* Month selector toolbar */}
        <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <button
            onClick={handlePrevMonth}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            aria-label="Previous month"
            id="prev-month-btn"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <h2 className="text-lg font-semibold text-white">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <span className="text-xs text-brand-400 font-medium">
              {monthEntries.length} {monthEntries.length === 1 ? 'absence' : 'absences'} scheduled
            </span>
          </div>

          <button
            onClick={handleNextMonth}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            aria-label="Next month"
            id="next-month-btn"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Content View */}
        {loading ? (
          <div className="card p-12 text-center text-slate-400">
            <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm">Loading team calendar...</p>
          </div>
        ) : viewMode === 'list' ? (
          /* List View (Default on mobile) */
          <div className="space-y-3" id="calendar-list-view">
            {monthEntries.length === 0 ? (
              <div className="card p-10 text-center text-slate-400">
                <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-slate-300">No absences scheduled</h3>
                <p className="text-xs text-slate-500 mt-1">Everyone in your team is available this month.</p>
              </div>
            ) : (
              monthEntries.map((entry, idx) => (
                <div
                  key={`${entry.user_id}-${entry.start_date}-${idx}`}
                  className="card p-4 flex items-center justify-between border-slate-800/80 hover:border-slate-700/80 transition"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600/30 to-indigo-600/30 border border-brand-500/20 flex items-center justify-center font-medium text-brand-300 text-sm">
                      {entry.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {/* Strictly shows "<Name> is away" per D2 Privacy Invariant */}
                      <div className="text-sm font-semibold text-white">
                        {entry.display_name} <span className="text-slate-400 font-normal">is away</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {displayDateRange(entry.start_date, entry.end_date)}
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    Away
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Month Grid View */
          <div className="card p-4 md:p-6" id="calendar-month-view">
            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 pb-3 border-b border-slate-800">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 pt-2">
              {daysInMonth.map((day) => {
                const dayAbsences = getAbsencesForDay(day);
                const hasAbsences = dayAbsences.length > 0;
                const isSelected = selectedDay && isSameDay(selectedDay, day);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-[64px] md:min-h-[84px] p-1.5 rounded-xl border flex flex-col items-start transition text-left ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500/10'
                        : hasAbsences
                        ? 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600'
                        : 'border-slate-800/50 hover:bg-slate-800/20'
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold mb-1 ${
                        isSameDay(day, new Date())
                          ? 'w-5 h-5 rounded-full bg-brand-500 text-slate-950 flex items-center justify-center'
                          : 'text-slate-300'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>

                    {/* Indicator dots or names */}
                    <div className="w-full space-y-1">
                      {dayAbsences.slice(0, 2).map((abs, i) => (
                        <div
                          key={i}
                          className="hidden md:block text-[10px] truncate px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium"
                          title={`${abs.display_name} is away`}
                        >
                          {abs.display_name.split(' ')[0]} away
                        </div>
                      ))}
                      {dayAbsences.length > 0 && (
                        <div className="md:hidden flex gap-1 items-center">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          {dayAbsences.length > 1 && (
                            <span className="text-[10px] text-amber-300 font-medium">
                              +{dayAbsences.length - 1}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected day drill-down */}
            {selectedDay && (
              <div className="mt-6 pt-4 border-t border-slate-800">
                <h4 className="text-sm font-semibold text-white mb-2">
                  Absences on {format(selectedDay, 'EEEE, d MMMM yyyy')}:
                </h4>
                {getAbsencesForDay(selectedDay).length === 0 ? (
                  <p className="text-xs text-slate-500">No team members away on this day.</p>
                ) : (
                  <div className="space-y-2">
                    {getAbsencesForDay(selectedDay).map((abs, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs"
                      >
                        <span className="font-medium text-slate-200">
                          {abs.display_name} <span className="text-slate-400">is away</span>
                        </span>
                        <span className="text-slate-400">
                          {displayDateRange(abs.start_date, abs.end_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
