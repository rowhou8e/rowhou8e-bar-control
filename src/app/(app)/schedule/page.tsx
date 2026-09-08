'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { store } from '@/lib/store';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { EditDayModal } from '@/components/calendar/EditDayModal';
import { formatThaiDate, toDateStr } from '@/lib/derive';
import {
  WEEKDAY_SHORT,
  approximateBuddhistHolyDays,
  isVerifiedHolyDayYear,
  buildMonthGrid,
  effectiveStatus,
  employeesOffOnDate,
  fixedThaiPublicHolidays,
  initials,
  monthLabel,
  specialDayColor,
  specialDaysForDate,
} from '@/lib/calendar-derive';
import type { Weekday } from '@/lib/types';

export default function SchedulePage() {
  const employee = useCurrentEmployee();
  const { employees, weeklyPatterns, workCalendarEntries, specialDays, now } = useAppState();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const canManage = employee?.role === 'owner' || employee?.role === 'manager';
  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);
  const weeks = useMemo(() => buildMonthGrid(year, month0), [year, month0]);
  const todayStr = toDateStr(now);
  const [fillingSpecialDays, setFillingSpecialDays] = useState(false);
  const hasSpecialDaysThisYear = specialDays.some((s) => s.date.startsWith(`${year}-`));

  async function handleAutoFillSpecialDays() {
    if (!employee) return;
    if (!isVerifiedHolyDayYear(year)) {
      const confirmed = window.confirm(
        `วันพระของปี ${year} ยังไม่ได้ตรวจสอบกับปฏิทินจันทรคติไทยจริง (เป็นการคำนวณโดยประมาณทางดาราศาสตร์ ซึ่งอาจคลาดเคลื่อนได้ทั้งปีถ้าปีนี้มีเดือนแปดสองหน)\n\nต้องการเติมวันสำคัญต่อหรือไม่? แนะนำให้ตรวจสอบวันพระกับปฏิทินจริงอีกครั้งหลังเติมแล้ว`
      );
      if (!confirmed) return;
    }
    setFillingSpecialDays(true);
    try {
      const holidays = fixedThaiPublicHolidays(year).map((h) => ({ date: h.date, dayType: 'วันหยุดราชการ' as const, label: h.label }));
      const holyDays = approximateBuddhistHolyDays(year).map((h) => ({ date: h.date, dayType: 'วันพระ' as const, label: h.label }));
      await store.bulkAddSpecialDays([...holidays, ...holyDays], employee.id);
    } finally {
      setFillingSpecialDays(false);
    }
  }

  function goMonth(delta: number) {
    let m = month0 + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth0(m);
    setYear(y);
  }

  const myTodayStatus = employee
    ? effectiveStatus(employee.id, todayStr, now.getDay() as Weekday, weeklyPatterns, workCalendarEntries)
    : null;

  return (
    <div>
      <Header title="ปฏิทินการทำงาน" subtitle={canManage ? 'มุมมองเจ้าของ/ผู้จัดการ — แตะวันที่เพื่อแก้ไข' : undefined} currentEmployee={employee} />

      <main className="space-y-4 px-4 py-4">
        {!canManage && myTodayStatus && (
          <div
            className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
              myTodayStatus.status === 'off' ? 'border-brand-200 bg-brand-50' : 'border-green-200 bg-status-okBg'
            }`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${
                myTodayStatus.status === 'off' ? 'bg-brand-600' : 'bg-status-ok'
              }`}
            >
              {myTodayStatus.status === 'off' ? '🏖️' : '✓'}
            </div>
            <div>
              <p className={`text-sm font-extrabold ${myTodayStatus.status === 'off' ? 'text-brand-800' : 'text-status-ok'}`}>
                {myTodayStatus.status === 'off' ? 'วันนี้เป็นวันหยุดของฉัน' : 'วันนี้เป็นวันทำงานของฉัน'}
              </p>
              <p className={`text-xs ${myTodayStatus.status === 'off' ? 'text-brand-700' : 'text-status-ok'}`}>{formatThaiDate(todayStr)}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button onClick={() => goMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-full active:bg-gray-100">
            <ChevronIcon direction="left" />
          </button>
          <p className="text-base font-extrabold text-gray-900">{monthLabel(year, month0)}</p>
          <button onClick={() => goMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-full active:bg-gray-100">
            <ChevronIcon direction="right" />
          </button>
        </div>

        {canManage && (
          <div className="flex flex-wrap justify-end gap-2">
            {!hasSpecialDaysThisYear && (
              <button
                type="button"
                disabled={fillingSpecialDays}
                onClick={handleAutoFillSpecialDays}
                className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[11px] font-semibold text-brand-700 active:bg-brand-100 disabled:opacity-50"
              >
                ✨ {fillingSpecialDays ? 'กำลังเติม...' : 'เติมวันสำคัญอัตโนมัติ'}
              </button>
            )}
            <Link
              href="/schedule/pattern"
              className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 active:bg-gray-50"
            >
              <RepeatIcon /> ตั้งค่าวันหยุดประจำ
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-gray-500">
          <LegendDot color="#DC2626" label="วันหยุดราชการ" />
          <LegendDot color="#EA580C" label="วันพระ" />
          <LegendDot color="#D97706" label="วันสำคัญ" />
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-[1.3px] border-dashed border-gray-400" /> เส้นประ = วันหยุดประจำ
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-gray-400" /> ทึบ = ลา/สลับกะ (ข้อยกเว้น)
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-gray-300" /> วันหยุดของฉัน
          </div>
        )}

        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-card">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_SHORT.map((label, i) => (
              <div
                key={label}
                className={`py-1 text-center text-[11px] font-bold ${i === 0 ? 'text-status-danger' : i === 6 ? 'text-sky-600' : 'text-gray-400'}`}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((cell, idx) => {
              if (!cell.inMonth || !cell.dateStr) return <div key={idx} className="min-h-[58px]" />;

              const dateStr = cell.dateStr;
              const isToday = dateStr === todayStr;
              const badges = specialDaysForDate(dateStr, specialDays);
              const badge = badges[0];
              const offList = employeesOffOnDate(dateStr, cell.weekday, activeEmployees, weeklyPatterns, workCalendarEntries);

              return (
                <button
                  key={idx}
                  disabled={!canManage}
                  onClick={() => canManage && setEditingDate(dateStr)}
                  className={`relative min-h-[58px] rounded-[10px] border p-1 text-left ${
                    isToday
                      ? 'border-brand-500 bg-brand-50'
                      : badge
                        ? 'border-gray-100 bg-brand-50/40'
                        : !canManage && offList.some((o) => o.employee.id === employee?.id)
                          ? 'border-gray-100 bg-gray-100'
                          : 'border-gray-100 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] ${
                        isToday
                          ? 'font-extrabold text-brand-700'
                          : cell.weekday === 0 || cell.weekday === 6
                            ? 'font-bold text-sky-600'
                            : 'font-semibold text-gray-700'
                      }`}
                    >
                      {cell.date?.getDate()}
                    </span>
                    {badge && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: specialDayColor(badge.dayType).dot }} />}
                  </div>
                  {isToday && <span className="absolute right-1 top-0.5 text-[7px] font-bold text-brand-600">วันนี้</span>}

                  {canManage && offList.length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                      {offList.slice(0, 4).map(({ employee: e, effective }) => (
                        <span
                          key={e.id}
                          className="flex h-[15px] w-[15px] items-center justify-center rounded-full text-[6.5px] font-bold"
                          style={
                            effective.source === 'pattern'
                              ? { border: `1.3px dashed ${e.avatarColor}`, color: e.avatarColor, backgroundColor: 'transparent' }
                              : { backgroundColor: e.avatarColor, color: '#fff' }
                          }
                          title={e.nickname}
                        >
                          {initials(e)}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {canManage ? (
          <p className="text-center text-[11.5px] text-gray-400">
            แตะวันที่เพื่อแก้ไขว่าใครหยุด — วันที่หยุดประจำ (เส้นประ) ไม่ต้องกดซ้ำทุกเดือน
          </p>
        ) : (
          <p className="text-center text-[11.5px] text-gray-400">ช่องสีเทา = วันที่ฉันหยุด • ดูได้อย่างเดียว แก้ไขไม่ได้</p>
        )}

        {canManage && (
          <Link
            href="/schedule/print"
            className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-brand-600 bg-white py-2.5 text-sm font-bold text-brand-600 active:bg-brand-50"
          >
            <PrinterIcon /> พิมพ์ตารางเป็น PDF
          </Link>
        )}
      </main>

      {editingDate && employee && (
        <EditDayModal
          dateStr={editingDate}
          weekday={new Date(`${editingDate}T00:00:00`).getDay() as Weekday}
          employees={activeEmployees}
          weeklyPatterns={weeklyPatterns}
          workCalendarEntries={workCalendarEntries}
          specialDays={specialDays}
          currentEmployee={employee}
          onClose={() => setEditingDate(null)}
        />
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {label}
    </span>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#424242" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
