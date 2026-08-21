'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { EmptyState, PrimaryButton } from '@/components/ui';
import { formatThaiDate, formatThaiDateTime, formatThaiMonthYear, getEmployeeName, groupCashReportsByMonth, toDateStr } from '@/lib/derive';
import type { CashReport, Employee } from '@/lib/types';

/** ย้อนหลังได้สูงสุดกี่เดือน (นับรวมเดือนปัจจุบัน) — กำหนดทั้งช่วงภาพรวมปฏิทินและช่วงที่อนุญาตให้บันทึกย้อนหลัง */
const BACKFILL_MONTHS = 3;

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** วันที่แบบย่อ เช่น "11 ส.ค." — ใช้ในตารางบันทึกย้อนหลังหลายวันที่ต้องการความกะทัดรัด */
function shortThaiDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
}

type DueDay = { date: string; day: number; status: 'recorded' | 'missing' | 'future' };
type OverviewMonth = { key: string; label: string; days: DueDay[]; recordedCount: number; dueCount: number };

/**
 * สร้างภาพรวม "เดือนไหน วันไหนบันทึกแล้ว/ยัง" ย้อนหลัง monthsBack เดือน (นับรวมเดือนปัจจุบัน)
 * เดือนปัจจุบันนับวันที่ครบกำหนดถึงวันนี้เท่านั้น (วันในอนาคตไม่ถือว่า "ยังไม่ได้บันทึก")
 * เดือนก่อนหน้านับครบทั้งเดือน — ผลลัพธ์เรียงเดือนปัจจุบันก่อน (ใหม่ -> เก่า)
 */
function buildOverviewMonths(now: Date, recordedDates: Set<string>, monthsBack: number): OverviewMonth[] {
  const months: OverviewMonth[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const base = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDueDay = i === 0 ? now.getDate() : daysInMonth;
    const days: DueDay[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStr(new Date(year, month, day));
      const status: DueDay['status'] = day > lastDueDay ? 'future' : recordedDates.has(dateStr) ? 'recorded' : 'missing';
      days.push({ date: dateStr, day, status });
    }
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: formatThaiMonthYear(key),
      days,
      recordedCount: days.filter((d) => d.status === 'recorded').length,
      dueCount: lastDueDay,
    });
  }
  return months;
}

export default function CashReportPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { cashReports, employees, now } = useAppState();

  // สรุปการเงิน/รายงานเงินสด — เจ้าของร้านเท่านั้น (ผู้จัดการทำได้ทุกอย่างยกเว้นส่วนนี้)
  const isOwner = employee?.role === 'owner';
  const canManageCash = isOwner || employee?.role === 'manager';

  const recordedDates = useMemo(() => new Set(cashReports.map((r) => r.date)), [cashReports]);
  const overviewMonths = useMemo(() => buildOverviewMonths(now, recordedDates, BACKFILL_MONTHS), [now, recordedDates]);
  const missingDates = useMemo(
    () =>
      overviewMonths
        .flatMap((m) => m.days.filter((d) => d.status === 'missing').map((d) => d.date))
        .sort((a, b) => b.localeCompare(a)),
    [overviewMonths]
  );

  if (employee && !canManageCash) {
    return (
      <div>
        <Header title="รายงานเงินสด" currentEmployee={employee} onBack={() => router.back()} />
        <main className="px-4 py-10 text-center">
          <p className="text-4xl">🔒</p>
          <p className="mt-3 text-sm font-semibold text-gray-700">หน้านี้สำหรับเจ้าของร้านและผู้จัดการเท่านั้น</p>
          <p className="mt-1 text-xs text-gray-400">ติดต่อเจ้าของร้านหรือผู้จัดการหากต้องการดูหรือบันทึกรายงานเงินสด</p>
        </main>
      </div>
    );
  }

  const todayStr = toDateStr(now);
  const currentMonthKey = todayStr.slice(0, 7);
  const todayReport = cashReports.find((r) => r.date === todayStr);
  const monthGroups = groupCashReportsByMonth(cashReports);
  const backfillDates = missingDates.filter((d) => d !== todayStr);

  return (
    <div>
      <Header title="รายงานเงินสด" subtitle="บันทึกยอดเงินสดปิดร้านประจำวัน" currentEmployee={employee} onBack={() => router.back()} />
      <main className="space-y-4 px-4 py-4">
        {!todayReport && <CashReportForm todayStr={todayStr} employeeId={employee?.id ?? ''} />}

        <MonthlyOverview months={overviewMonths} missingCount={missingDates.length} />

        <MissingDaysForm dates={backfillDates} employeeId={employee?.id ?? ''} />

        <div>
          <p className="mb-2 text-xs font-bold text-gray-700">ประวัติรายงานเงินสด ({cashReports.length} รายการ)</p>
          {monthGroups.length === 0 ? (
            <EmptyState icon="💵" title="ยังไม่มีประวัติรายงานเงินสด" />
          ) : (
            <div className="space-y-3">
              {monthGroups.map((group) => (
                <MonthGroup
                  key={group.key}
                  group={group}
                  todayStr={todayStr}
                  employees={employees}
                  employeeId={employee?.id ?? ''}
                  defaultOpen={group.key === currentMonthKey}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CashReportForm({ todayStr, employeeId }: { todayStr: string; employeeId: string }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const valid = amount.trim() !== '' && Number(amount) >= 0;

  function handleSubmit() {
    if (!employeeId || !valid) return;
    setSubmitting(true);
    store.submitCashReport({ date: todayStr, closingAmount: Number(amount), note: note.trim(), actorId: employeeId });
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <label className="text-xs font-semibold text-gray-500">ยอดเงินสดรวมตอนปิดร้านวันนี้ (บาท)</label>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-lg font-bold outline-none focus:border-brand-400"
      />
      <label className="mt-3 block text-xs font-semibold text-gray-500">หมายเหตุ (ถ้ามี)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="เช่น เหตุผลที่ยอดขาด/เกิน"
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
      />
      <div className="mt-3">
        <PrimaryButton onClick={handleSubmit} disabled={!valid || submitting}>
          บันทึกยอดปิดร้าน
        </PrimaryButton>
      </div>
    </div>
  );
}

/** การ์ดภาพรวม "เดือนไหน วันไหนบันทึกแล้ว/ยัง" — ช่องสีเขียว=บันทึกแล้ว, สีเหลือง=ยังไม่ได้บันทึก(เลยกำหนดแล้ว), เทาจาง=ยังไม่ถึงวัน */
function MonthlyOverview({ months, missingCount }: { months: OverviewMonth[]; missingCount: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-700">ภาพรวมการบันทึก ({months.length} เดือนล่าสุด)</p>
        {missingCount > 0 ? (
          <span className="shrink-0 rounded-full bg-status-warnBg px-2 py-0.5 text-[11px] font-bold text-status-warn">
            ยังไม่ได้บันทึก {missingCount} วัน
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-status-okBg px-2 py-0.5 text-[11px] font-bold text-status-ok">บันทึกครบทุกวัน ✓</span>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {months.map((m) => (
          <div key={m.key}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">{m.label}</p>
              <p className="text-[11px] text-gray-400">
                บันทึกแล้ว {m.recordedCount}/{m.dueCount} วัน
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.days.map((d) => (
                <div
                  key={d.date}
                  title={formatThaiDate(d.date)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                    d.status === 'recorded'
                      ? 'bg-status-okBg text-status-ok'
                      : d.status === 'missing'
                        ? 'bg-status-warnBg text-status-warn'
                        : 'bg-gray-50 text-gray-300'
                  }`}
                >
                  {d.day}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ฟอร์มกะทัดรัดสำหรับ "บันทึกย้อนหลังทีเดียวหลายวัน" — ดึงรายชื่อวันที่ยังไม่ได้บันทึกมาให้อัตโนมัติ (ไม่ต้องเลือกวันเอง)
 * แต่ละวันกรอกยอด/หมายเหตุแยกกันได้ กดบันทึกครั้งเดียวส่งครบทุกวันที่กรอกยอดไว้
 * ทยอยส่งทีละวัน (await ทีละรายการ) เพราะ LiveStore รีเฟรชข้อมูลทั้งหน้าหลังบันทึกแต่ละครั้ง กันข้อมูลชนกันถ้ายิงพร้อมกันหลายคำขอ
 */
function MissingDaysForm({ dates, employeeId }: { dates: string[]; employeeId: string }) {
  const [drafts, setDrafts] = useState<Record<string, { amount: string; note: string }>>({});
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (dates.length === 0) return null;

  const VISIBLE_LIMIT = 10;
  const visibleDates = expanded ? dates : dates.slice(0, VISIBLE_LIMIT);
  const hiddenCount = dates.length - visibleDates.length;

  function getDraft(date: string) {
    return drafts[date] ?? { amount: '', note: '' };
  }
  function setDraftAmount(date: string, amount: string) {
    setDrafts((prev) => ({ ...prev, [date]: { ...getDraft(date), amount } }));
  }
  function setDraftNote(date: string, note: string) {
    setDrafts((prev) => ({ ...prev, [date]: { ...getDraft(date), note } }));
  }

  const filledDates = dates.filter((d) => {
    const amount = getDraft(d).amount;
    return amount.trim() !== '' && Number(amount) >= 0;
  });

  async function handleSubmitAll() {
    if (!employeeId || filledDates.length === 0) return;
    setSubmitting(true);
    try {
      for (const date of filledDates) {
        const draft = getDraft(date);
        await store.submitCashReport({ date, closingAmount: Number(draft.amount), note: draft.note.trim(), actorId: employeeId });
      }
      setDrafts((prev) => {
        const next = { ...prev };
        for (const date of filledDates) delete next[date];
        return next;
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-3 shadow-card">
      <p className="text-xs font-bold text-gray-700">บันทึกย้อนหลัง ({dates.length} วันที่ยังไม่ได้บันทึก)</p>
      <p className="mt-0.5 text-[11px] text-gray-400">กรอกยอดของวันที่ต้องการ แล้วกดบันทึกทั้งหมดได้ในครั้งเดียว</p>
      <div className="mt-2 divide-y divide-gray-100">
        {visibleDates.map((date) => {
          const draft = getDraft(date);
          return (
            <div key={date} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
              <div className="w-14 shrink-0 text-[11px] font-semibold text-gray-600">{shortThaiDate(date)}</div>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.amount}
                onChange={(e) => setDraftAmount(date, e.target.value)}
                placeholder="ยอด"
                className="w-20 shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold outline-none focus:border-brand-400"
              />
              <input
                type="text"
                value={draft.note}
                onChange={(e) => setDraftNote(date, e.target.value)}
                placeholder="หมายเหตุ (ถ้ามี)"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400"
              />
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-2 text-[11px] font-semibold text-brand-600">
          แสดงเพิ่มเติมอีก {hiddenCount} วัน
        </button>
      )}
      <div className="mt-3">
        <button
          onClick={handleSubmitAll}
          disabled={filledDates.length === 0 || submitting}
          className="w-full rounded-lg bg-brand-600 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          {submitting ? 'กำลังบันทึก...' : `บันทึกทั้งหมด${filledDates.length > 0 ? ` (${filledDates.length} วัน)` : ''}`}
        </button>
      </div>
    </div>
  );
}

/** การ์ดสรุปรายเดือน — แตะเพื่อขยาย/ย่อดูรายการรายวันในเดือนนั้น */
function MonthGroup({
  group,
  todayStr,
  employees,
  employeeId,
  defaultOpen,
}: {
  group: { key: string; items: CashReport[]; total: number };
  todayStr: string;
  employees: Employee[];
  employeeId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <div>
          <p className="text-sm font-bold text-gray-900">{formatThaiMonthYear(group.key)}</p>
          <p className="text-[11px] text-gray-400">บันทึกแล้ว {group.items.length} วัน</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold text-brand-700">{group.total.toLocaleString()} บาท</p>
          <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t border-gray-100 px-3 pb-3 pt-2">
          {group.items.map((r) => (
            <CashReportRow key={r.id} report={r} employees={employees} employeeId={employeeId} highlight={r.date === todayStr} />
          ))}
        </div>
      )}
    </div>
  );
}

/** แถวรายงานเงินสดหนึ่งวัน — แสดงผล หรือสลับเป็นฟอร์มแก้ไข (ยอดเงิน + หมายเหตุ) ได้ เนื่องจากหน้านี้จำกัดสิทธิ์แค่ owner/manager อยู่แล้ว */
function CashReportRow({
  report,
  employees,
  employeeId,
  highlight,
}: {
  report: CashReport;
  employees: Employee[];
  employeeId: string;
  highlight: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(report.closingAmount));
  const [note, setNote] = useState(report.note);

  const valid = amount.trim() !== '' && Number(amount) >= 0;

  function handleSave() {
    if (!valid) return;
    store.updateCashReport(report.id, { closingAmount: Number(amount), note: note.trim() }, employeeId);
    setEditing(false);
  }

  function handleCancel() {
    setAmount(String(report.closingAmount));
    setNote(report.note);
    setEditing(false);
  }

  const cardTone = highlight ? 'bg-status-okBg' : 'bg-white ring-1 ring-gray-100';

  if (editing) {
    return (
      <div className={`rounded-2xl p-4 ${cardTone}`}>
        <p className="text-xs font-bold text-gray-700">{formatThaiDate(report.date)}</p>
        <label className="mt-2 block text-xs font-semibold text-gray-500">ยอดเงินสดรวมตอนปิดร้าน (บาท)</label>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-base font-bold outline-none focus:border-brand-400"
        />
        <label className="mt-2 block text-xs font-semibold text-gray-500">หมายเหตุ</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!valid}
            className="flex-1 rounded-xl bg-brand-600 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            บันทึก
          </button>
          <button onClick={handleCancel} className="flex-1 rounded-xl bg-gray-100 py-2 text-xs font-semibold text-gray-600">
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-4 ${cardTone}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {highlight && <p className="text-xs font-semibold text-status-ok">บันทึกยอดปิดร้านวันนี้แล้ว</p>}
          <p className="text-sm font-bold text-gray-900">{formatThaiDate(report.date)}</p>
          <p className="mt-1 text-xl font-extrabold text-gray-900">{report.closingAmount.toLocaleString()} บาท</p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-md bg-white/80 px-2 py-1 text-[10px] font-semibold text-gray-600 shadow-sm"
        >
          แก้ไข
        </button>
      </div>
      {report.note && <p className="mt-1.5 text-xs text-gray-600">หมายเหตุ: {report.note}</p>}
      <p className="mt-2 text-[11px] text-gray-400">
        บันทึกโดย {getEmployeeName(employees, report.submittedBy)} · {formatThaiDateTime(report.submittedAt)}
      </p>
    </div>
  );
}
