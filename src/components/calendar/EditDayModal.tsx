'use client';

import { useMemo, useState } from 'react';
import { store } from '@/lib/store';
import { formatThaiDate } from '@/lib/derive';
import { effectiveStatus, specialDaysForDate, specialDayColor, swapPartnerEntry, initials } from '@/lib/calendar-derive';
import type { Employee, SpecialDay, Weekday, WorkCalendarEntry, WorkCalendarReasonType, WorkCalendarStatus, WeeklyPatternEntry } from '@/lib/types';

const REASONS: WorkCalendarReasonType[] = ['ลา', 'สลับกะ', 'อื่นๆ'];

interface Draft {
  status: WorkCalendarStatus;
  reasonType: WorkCalendarReasonType | null;
  note: string;
  swapWithEmployeeId: string;
  swapDate: string;
}

export function EditDayModal({
  dateStr,
  weekday,
  employees,
  weeklyPatterns,
  workCalendarEntries,
  specialDays,
  currentEmployee,
  onClose,
}: {
  dateStr: string;
  weekday: Weekday;
  employees: Employee[];
  weeklyPatterns: WeeklyPatternEntry[];
  workCalendarEntries: WorkCalendarEntry[];
  specialDays: SpecialDay[];
  currentEmployee: Employee;
  onClose: () => void;
}) {
  const dayBadges = specialDaysForDate(dateStr, specialDays);
  const [saving, setSaving] = useState(false);

  const initialDrafts = useMemo(() => {
    const map: Record<string, Draft> = {};
    for (const emp of employees) {
      const eff = effectiveStatus(emp.id, dateStr, weekday, weeklyPatterns, workCalendarEntries);
      const partner = eff.entry ? swapPartnerEntry(eff.entry, workCalendarEntries) : null;
      map[emp.id] = {
        status: eff.status,
        reasonType: eff.entry?.reasonType ?? null,
        note: eff.entry?.note ?? '',
        swapWithEmployeeId: partner?.employeeId ?? '',
        swapDate: partner?.date ?? '',
      };
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>(initialDrafts);

  function canEditRow(emp: Employee): boolean {
    if (currentEmployee.role === 'owner') return true;
    if (currentEmployee.role === 'manager') return emp.role !== 'owner';
    return false;
  }

  function updateDraft(employeeId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [employeeId]: { ...prev[employeeId], ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const emp of employees) {
        if (!canEditRow(emp)) continue;
        const draft = drafts[emp.id];
        const original = initialDrafts[emp.id];
        const changed =
          draft.status !== original.status ||
          draft.reasonType !== original.reasonType ||
          draft.note !== original.note ||
          draft.swapWithEmployeeId !== original.swapWithEmployeeId ||
          draft.swapDate !== original.swapDate;
        if (!changed) continue;

        const eff = effectiveStatus(emp.id, dateStr, weekday, weeklyPatterns, workCalendarEntries);
        const existingSwapId = eff.entry?.swapPairId ?? null;

        if (draft.status === 'work') {
          if (existingSwapId) {
            await store.removeCalendarSwap(existingSwapId, currentEmployee.id);
          } else if (eff.source === 'exception') {
            await store.clearCalendarDay(emp.id, dateStr, currentEmployee.id);
          }

          // ถ้าวันนี้หยุดประจำตาม pattern อยู่แล้ว การล้างข้อยกเว้น/ยกเลิกสลับกะข้างบนจะทำให้กลับไป
          // เป็น "หยุด" ตาม pattern เหมือนเดิม (ไม่ใช่ "ทำงาน" ตามที่ตั้งใจ) — ต้องสร้างข้อยกเว้นระบุ
          // "ทำงาน" ชัดเจนสำหรับวันนี้แทน เพื่อให้ค่าที่เจ้าของ/ผู้จัดการตั้งไว้มีผลจริง
          const patternEntry = weeklyPatterns.find((p) => p.employeeId === emp.id && p.weekday === weekday);
          if (patternEntry?.isDayOff) {
            await store.setCalendarDay({
              employeeId: emp.id,
              date: dateStr,
              status: 'work',
              reasonType: null,
              note: '',
              actorId: currentEmployee.id,
            });
          }
          continue;
        }

        // status === 'off'
        if (draft.reasonType === 'สลับกะ' && draft.swapWithEmployeeId && draft.swapDate) {
          if (existingSwapId) {
            await store.removeCalendarSwap(existingSwapId, currentEmployee.id);
          }
          await store.createCalendarSwap({
            employeeAId: emp.id,
            dateA: dateStr,
            statusA: 'off',
            employeeBId: draft.swapWithEmployeeId,
            dateB: draft.swapDate,
            statusB: 'off',
            note: draft.note,
            actorId: currentEmployee.id,
          });
        } else {
          if (existingSwapId) {
            await store.removeCalendarSwap(existingSwapId, currentEmployee.id);
          }
          await store.setCalendarDay({
            employeeId: emp.id,
            date: dateStr,
            status: 'off',
            reasonType: draft.reasonType ?? 'อื่นๆ',
            note: draft.note,
            actorId: currentEmployee.id,
          });
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-gray-900/45" onClick={onClose} />
      <div className="relative flex max-h-[82%] w-full max-w-app flex-col rounded-t-3xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)]">
        <div className="flex justify-center pb-1 pt-2.5">
          <div className="h-1 w-9 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-5 pb-3.5 pt-2">
          <div>
            <p className="text-base font-extrabold text-gray-900">แก้ไขวันหยุด</p>
            <p className="text-[13px] text-gray-500">{formatThaiDate(dateStr)}</p>
          </div>
          {dayBadges.length > 0 && (
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {dayBadges.map((b) => {
                const c = specialDayColor(b.dayType);
                return (
                  <span
                    key={b.id}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ color: c.text, backgroundColor: c.bg }}
                  >
                    {b.dayType}
                    {currentEmployee.role === 'owner' || currentEmployee.role === 'manager' ? (
                      <button
                        type="button"
                        title="ลบวันสำคัญนี้ (ระบุผิด)"
                        onClick={() => store.removeSpecialDay(b.id, currentEmployee.id)}
                        className="ml-0.5 leading-none opacity-70"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="om-scrollbar flex-1 overflow-y-auto px-3 py-1.5">
          {employees.map((emp) => {
            const draft = drafts[emp.id];
            const editable = canEditRow(emp);
            const isOff = draft.status === 'off';
            return (
              <div key={emp.id} className={`border-b border-gray-50 px-2 py-2.5 last:border-b-0 ${editable ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ backgroundColor: emp.avatarColor }}
                  >
                    {initials(emp)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900">{emp.name} <span className="font-normal text-gray-400">({emp.nickname})</span></p>
                    <p className="text-[11.5px] text-gray-400">
                      {emp.role === 'owner' ? 'เจ้าของ' : emp.role === 'manager' ? 'ผู้จัดการ' : 'พนักงาน'}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11.5px] font-semibold ${isOff ? 'text-brand-700' : 'text-status-ok'}`}>
                    {isOff ? 'หยุด' : 'ทำงาน'}
                  </span>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => updateDraft(emp.id, { status: isOff ? 'work' : 'off', reasonType: isOff ? null : draft.reasonType ?? 'ลา' })}
                    className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${isOff ? 'bg-brand-600' : 'bg-gray-200'} disabled:cursor-not-allowed`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isOff ? 'left-[18px]' : 'left-0.5'}`}
                    />
                  </button>
                </div>

                {isOff && editable && (
                  <div className="ml-11 mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => updateDraft(emp.id, { reasonType: r })}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                            draft.reasonType === r ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>

                    {(draft.reasonType === 'ลา' || draft.reasonType === 'อื่นๆ') && (
                      <input
                        type="text"
                        value={draft.note}
                        onChange={(e) => updateDraft(emp.id, { note: e.target.value })}
                        placeholder="หมายเหตุ (ไม่บังคับ) เช่น ลาป่วย"
                        className="w-full rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-[12.5px] text-gray-700 outline-none focus:border-brand-300"
                      />
                    )}

                    {draft.reasonType === 'สลับกะ' && (
                      <div className="space-y-1.5 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
                        <p className="text-[11px] font-semibold text-brand-800">สลับกะกับ</p>
                        <select
                          value={draft.swapWithEmployeeId}
                          onChange={(e) => updateDraft(emp.id, { swapWithEmployeeId: e.target.value })}
                          className="w-full rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-[12px] text-gray-700 outline-none"
                        >
                          <option value="">เลือกพนักงาน...</option>
                          {employees.filter((e2) => e2.id !== emp.id).map((e2) => (
                            <option key={e2.id} value={e2.id}>
                              {e2.name} ({e2.nickname})
                            </option>
                          ))}
                        </select>
                        <p className="pt-0.5 text-[11px] font-semibold text-brand-800">วันชดเชย (วันที่คู่สลับจะหยุดแทน)</p>
                        <input
                          type="date"
                          value={draft.swapDate}
                          onChange={(e) => updateDraft(emp.id, { swapDate: e.target.value })}
                          className="w-full rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-[12px] text-gray-700 outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2.5 border-t border-gray-100 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 active:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
