'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { EmptyState, PhotoAttach, PrimaryButton } from '@/components/ui';
import { isChecklistItemScheduledToday, toDateStr } from '@/lib/derive';
import { RISKY_CHECKLIST_STATUSES } from '@/lib/types';
import type { ChecklistEntryItem, ChecklistItemStatus } from '@/lib/types';

// ครบ 9 สถานะตามสเปก Rowhou8e OPS §7 — expired/unusable/production_failed (กลุ่มเสี่ยง) บังคับรูป+เหตุผล+จำนวน
const STATUS_OPTIONS: { value: ChecklistItemStatus; label: string; tone: string }[] = [
  { value: 'normal', label: 'ปกติ', tone: 'border-status-ok text-status-ok bg-status-okBg' },
  { value: 'near_expiry', label: 'ใกล้หมดอายุ', tone: 'border-status-warn text-status-warn bg-status-warnBg' },
  { value: 'used_up', label: 'ใช้หมดแล้ว', tone: 'border-status-idle text-status-idle bg-status-idleBg' },
  { value: 'unusable', label: 'ใช้ไม่ได้', tone: 'border-status-danger text-status-danger bg-status-dangerBg' },
  { value: 'expired', label: 'หมดอายุ', tone: 'border-status-danger text-status-danger bg-status-dangerBg' },
  { value: 'banned', label: 'ห้ามใช้', tone: 'border-red-500 text-red-600 bg-red-50' },
  { value: 'discarded', label: 'ทิ้งแล้ว', tone: 'border-gray-400 text-gray-600 bg-gray-100' },
  { value: 'refilled', label: 'ผลิตใหม่แล้ว', tone: 'border-sky-400 text-sky-600 bg-sky-50' },
  { value: 'production_failed', label: 'ผลิตไม่ผ่าน', tone: 'border-purple-400 text-purple-600 bg-purple-50' },
];

type DraftItem = ChecklistEntryItem & { touched: boolean };

function isRisky(status: ChecklistItemStatus) {
  return (RISKY_CHECKLIST_STATUSES as ChecklistItemStatus[]).includes(status);
}

/** ข้อ (draft) หนึ่งข้อถือว่า "ครบ" เมื่อ: ปกติ/ไม่เสี่ยง = แค่เลือกสถานะ, กลุ่มเสี่ยง = ต้องมีรูป+เหตุผล+จำนวนด้วย (สเปก §7) */
function isItemReady(item: DraftItem) {
  if (!item.touched) return false;
  if (!isRisky(item.status)) return true;
  return !!item.photoUrl && item.note.trim().length > 0 && item.quantity !== null && item.quantity >= 0;
}

function NewChecklistForm() {
  const router = useRouter();
  const params = useSearchParams();
  const employee = useCurrentEmployee();
  const { stations, checklistTemplate, now } = useAppState();

  const stationId = params.get('station') ?? employee?.stationId ?? '';
  const station = stations.find((s) => s.id === stationId);
  const activeItems = checklistTemplate.filter((t) => t.stationId === stationId && t.active && isChecklistItemScheduledToday(t, now)).sort((a, b) => a.order - b.order);

  const todayStr = toDateStr(now);
  const canBackdate = employee?.role === 'owner' || employee?.role === 'manager';
  const requestedDate = params.get('date') ?? todayStr;
  // staff ห้ามทำย้อนหลัง (สเปก §7/§18) — บังคับเป็นวันนี้เสมอไม่ว่า query param จะระบุอะไรมา
  const dateStr = canBackdate ? requestedDate : todayStr;
  const backdated = dateStr !== todayStr;

  const [backdatedReason, setBackdatedReason] = useState('');
  const [drafts, setDrafts] = useState<DraftItem[]>(
    activeItems.map((t) => ({ templateItemId: t.id, label: t.label, status: 'normal', note: '', photoUrl: null, quantity: null, touched: false }))
  );
  const [submitting, setSubmitting] = useState(false);

  if (!station || activeItems.length === 0) {
    return (
      <div>
        <Header title="ทำเช็กลิสต์" currentEmployee={employee} onBack={() => router.back()} />
        <main className="px-4 py-6">
          <EmptyState icon="🏷️" title="ไม่พบแผนกที่ต้องการทำเช็กลิสต์" subtitle="กลับไปเลือกแผนกจากหน้าเช็กลิสต์อีกครั้ง" />
        </main>
      </div>
    );
  }

  const allTouched = drafts.every(isItemReady);
  const readyCount = drafts.filter(isItemReady).length;
  const problemCount = drafts.filter((d) => d.status !== 'normal').length;
  const backdatedOk = !backdated || backdatedReason.trim().length > 0;

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch, touched: true } : d)));
  }

  function handleSubmit() {
    if (!employee || !allTouched || !station || !backdatedOk) return;
    setSubmitting(true);
    const items: ChecklistEntryItem[] = drafts.map(({ touched, ...rest }) => rest);
    store.submitChecklist(station.id, dateStr, items, employee.id, backdated ? backdatedReason.trim() : null);
    router.replace('/checklist');
  }

  return (
    <div>
      <Header
        title={`ทำเช็กลิสต์ · ${station.name}`}
        subtitle={backdated ? `ทำย้อนหลังวันที่ ${dateStr} · ${readyCount}/${drafts.length} ข้อ` : `${readyCount}/${drafts.length} ข้อ`}
        currentEmployee={employee}
        onBack={() => router.back()}
      />

      <main className="space-y-3 px-4 py-4">
        {backdated && (
          <div className="rounded-xl bg-status-warnBg px-3.5 py-2.5 text-xs text-status-warn">
            <p className="font-semibold">⚠️ กำลังทำเช็กลิสต์ย้อนหลังของวันที่ {dateStr}</p>
            <p className="mt-1">ต้องระบุเหตุผลที่ทำย้อนหลัง — ระบบจะบันทึกไว้ในประวัติ</p>
            <textarea
              value={backdatedReason}
              onChange={(e) => setBackdatedReason(e.target.value)}
              rows={2}
              placeholder="เหตุผลที่ทำย้อนหลัง (บังคับกรอก)"
              className="mt-2 w-full rounded-xl border border-status-warn/40 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-status-warn"
            />
          </div>
        )}

        <div className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-xs text-brand-700">
          กรุณาเลือกสถานะให้ครบทุกข้อ — สถานะ &quot;ใช้ไม่ได้ / หมดอายุ / ผลิตไม่ผ่าน&quot; ต้องแนบรูป ระบุเหตุผล และจำนวนเสมอ
          (ระบบจะแจ้งเตือนผู้จัดการทันที)
        </div>

        {drafts.map((item, idx) => {
          const risky = isRisky(item.status);
          return (
            <div key={item.templateItemId} className="rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    isItemReady(item) ? 'bg-status-ok text-white' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isItemReady(item) ? '✓' : idx + 1}
                </span>
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateItem(idx, { status: opt.value })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      item.status === opt.value ? opt.tone : 'border-gray-200 bg-white text-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {item.status !== 'normal' && (
                <div className="mt-3 space-y-2">
                  {risky && (
                    <p className="text-[11px] font-semibold text-status-danger">
                      ⚠️ สถานะนี้บังคับแนบรูป + ระบุเหตุผล + ระบุจำนวน ก่อนบันทึกได้
                    </p>
                  )}
                  <textarea
                    value={item.note}
                    onChange={(e) => updateItem(idx, { note: e.target.value })}
                    placeholder={risky ? 'เหตุผล (บังคับกรอก)' : 'หมายเหตุ (เช่น สาเหตุ, รายละเอียดเพิ่มเติม)'}
                    rows={2}
                    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand-400 ${
                      risky && !item.note.trim() ? 'border-status-danger/50' : 'border-gray-200'
                    }`}
                  />
                  {risky && (
                    <input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={item.quantity ?? ''}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="จำนวน (บังคับกรอก)"
                      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand-400 ${
                        item.quantity === null ? 'border-status-danger/50' : 'border-gray-200'
                      }`}
                    />
                  )}
                  <PhotoAttach value={item.photoUrl} onChange={(url) => updateItem(idx, { photoUrl: url })} />
                </div>
              )}
            </div>
          );
        })}

        {problemCount > 0 && (
          <div className="rounded-xl bg-status-warnBg px-3.5 py-2.5 text-center text-xs font-semibold text-status-warn">
            พบ {problemCount} รายการที่ต้องติดตาม ระบบจะบันทึกไว้ในประวัติและแจ้งเตือน
          </div>
        )}

        <div className="sticky bottom-3 pt-2">
          <PrimaryButton onClick={handleSubmit} disabled={!allTouched || !backdatedOk || submitting}>
            {allTouched
              ? backdated
                ? backdatedOk
                  ? `ส่งเช็กลิสต์ย้อนหลัง (${drafts.length}/${drafts.length})`
                  : 'กรุณาระบุเหตุผลที่ทำย้อนหลัง'
                : `ส่งเช็กลิสต์ (${drafts.length}/${drafts.length})`
              : `กรุณาตรวจให้ครบก่อน (${readyCount}/${drafts.length})`}
          </PrimaryButton>
        </div>
      </main>
    </div>
  );
}

export default function NewChecklistPage() {
  return (
    <Suspense fallback={null}>
      <NewChecklistForm />
    </Suspense>
  );
}
