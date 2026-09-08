'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { store } from '@/lib/store';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { WEEKDAY_SHORT, initials } from '@/lib/calendar-derive';
import { roleLabel } from '@/lib/derive';
import type { Weekday } from '@/lib/types';

export default function WeeklyPatternSettingsPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { employees, weeklyPatterns } = useAppState();

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);
  const canManage = employee?.role === 'owner' || employee?.role === 'manager';

  // draft: employeeId -> set ของ weekday ที่หยุดประจำ
  const [draft, setDraft] = useState<Record<string, Set<Weekday>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial: Record<string, Set<Weekday>> = {};
    for (const emp of activeEmployees) {
      initial[emp.id] = new Set(weeklyPatterns.filter((p) => p.employeeId === emp.id && p.isDayOff).map((p) => p.weekday));
    }
    setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmployees.length]);

  function toggleDay(employeeId: string, weekday: Weekday) {
    if (!canManage) return;
    setDraft((prev) => {
      const next = new Set(prev[employeeId] ?? []);
      if (next.has(weekday)) next.delete(weekday);
      else next.add(weekday);
      return { ...prev, [employeeId]: next };
    });
  }

  async function handleSave() {
    if (!employee) return;
    setSaving(true);
    try {
      for (const emp of activeEmployees) {
        const days: Weekday[] = [0, 1, 2, 3, 4, 5, 6] as Weekday[];
        const payload = days.map((weekday) => ({ weekday, isDayOff: (draft[emp.id] ?? new Set()).has(weekday) }));
        await store.setWeeklyPattern(emp.id, payload, employee.id);
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  function patternCaption(days: Set<Weekday>): string | null {
    if (days.size === 0) return null;
    const names = [...days].sort().map((d) => `วัน${['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][d]}`);
    return `หยุดประจำทุก${names.join(', ')}`;
  }

  return (
    <div>
      <Header title="ตั้งค่าวันหยุดประจำ" currentEmployee={employee} onBack={() => router.back()} />
      <main className="px-4 py-4">
        <p className="mb-3 text-xs text-gray-500">
          ตั้งวันหยุดประจำรายสัปดาห์ต่อคน ครั้งเดียวใช้ได้ทุกเดือน — คนที่ไม่มีวันหยุดตายตัวปล่อยว่างไว้ได้
        </p>

        <div className="space-y-1 rounded-2xl border border-gray-100 bg-white p-2 shadow-card">
          {activeEmployees.map((emp) => {
            const days = draft[emp.id] ?? new Set<Weekday>();
            const caption = patternCaption(days);
            return (
              <div key={emp.id} className="border-b border-gray-50 px-1.5 py-2.5 last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ backgroundColor: emp.avatarColor }}
                  >
                    {initials(emp)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-gray-900">{emp.name} <span className="font-normal text-gray-400">({emp.nickname})</span></p>
                    <p className="text-[10.5px] text-gray-400">{roleLabel(emp.role)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {WEEKDAY_SHORT.map((label, i) => {
                      const weekday = i as Weekday;
                      const selected = days.has(weekday);
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={!canManage}
                          onClick={() => toggleDay(emp.id, weekday)}
                          className={`flex h-[27px] w-[27px] items-center justify-center rounded-full text-[10.5px] font-bold ${
                            selected ? 'bg-brand-600 text-white' : 'border-[1.3px] border-gray-200 text-gray-300'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {caption && <p className="ml-[44px] mt-1 text-[10.5px] font-semibold text-brand-600">{caption}</p>}
              </div>
            );
          })}
        </div>

        <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
          <InfoIcon />
          <p className="text-[11.5px] leading-relaxed text-sky-700">
            ลาป่วยหรือสลับกะเป็นครั้งคราวไม่ต้องแก้หน้านี้ — ไปแก้ที่ปฏิทินหลัก (แตะวันนั้นวันเดียว) แทน หน้านี้ใช้สำหรับ &ldquo;รูปแบบปกติ&rdquo; เท่านั้น
          </p>
        </div>
      </main>

      {canManage && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-gray-100 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0369A1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
