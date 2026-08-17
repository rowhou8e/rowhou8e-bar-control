'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { SeverityBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/ui';
import { formatThaiDateTime, generateLiveNotifications, getEmployeeName, liveNotificationStationId } from '@/lib/derive';
import type { Employee, NotificationSeverity, NotificationType, OrderReminder, Station } from '@/lib/types';

const SEVERITY_TABS: { value: NotificationSeverity | 'all'; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'blocked', label: 'ห้ามใช้สินค้า' },
  { value: 'urgent', label: 'เร่งด่วน' },
  { value: 'review', label: 'ควรตรวจสอบ' },
  { value: 'info', label: 'ข้อมูลทั่วไป' },
];

const TYPE_LINK: Partial<Record<NotificationType, (id: string | null) => string>> = {
  checklist_missing: () => '/checklist',
  lot_near_expiry: () => '/milk',
  lot_expired: () => '/milk',
  production_failed: () => '/milk',
  purchase_not_received: (id) => (id ? `/purchase-orders/${id}` : '/purchase-orders'),
};

export default function NotificationsPage() {
  const employee = useCurrentEmployee();
  const state = useAppState();
  const { stations, employees, orderReminders, checklistRuns, productLots, products } = state;
  const [tab, setTab] = useState<NotificationSeverity | 'all'>('all');

  const canManage = employee?.role === 'owner' || employee?.role === 'manager';

  const liveNotificationsAll = useMemo(
    () =>
      generateLiveNotifications({
        now: state.now,
        settings: state.settings,
        stations: state.stations,
        checklistRuns: state.checklistRuns,
        stockItems: state.stockItems,
        products: state.products,
        productLots: state.productLots,
        purchaseRequests: state.purchaseRequests,
        purchaseOrders: state.purchaseOrders,
        storeHolidays: state.storeHolidays,
      }),
    [state]
  );

  // แจ้งเตือนทั่วไป — พนักงานทั่วไปเห็นเฉพาะของแผนกตัวเอง (เจ้าของ/ผู้จัดการเห็นทุกแผนก) ตามสเปกการแจ้งเตือนรายแผนก
  const liveNotifications = useMemo(() => {
    if (!employee) return [];
    if (canManage) return liveNotificationsAll;
    return liveNotificationsAll.filter((n) => {
      const stationId = liveNotificationStationId(n, { checklistRuns, productLots, products });
      return stationId !== null && stationId === employee.stationId;
    });
  }, [liveNotificationsAll, canManage, employee, checklistRuns, productLots, products]);

  // แจ้งเตือนให้สั่งสินค้า — เจ้าของ/ผู้จัดการเห็นทุกแผนก พนักงานทั่วไปเห็นเฉพาะแผนกตัวเอง
  const scopedReminders = useMemo(() => {
    if (!employee) return [];
    if (canManage) return orderReminders;
    return orderReminders.filter((r) => r.stationId === employee.stationId);
  }, [orderReminders, canManage, employee]);

  const pendingRemindersForMe = scopedReminders.filter((r) => !r.acknowledgedBy);

  const filtered = tab === 'all' ? liveNotifications : liveNotifications.filter((n) => n.severity === tab);
  const counts = {
    blocked: liveNotifications.filter((n) => n.severity === 'blocked').length,
    urgent: liveNotifications.filter((n) => n.severity === 'urgent').length,
    review: liveNotifications.filter((n) => n.severity === 'review').length,
    info: liveNotifications.filter((n) => n.severity === 'info').length,
  };

  return (
    <div>
      <Header
        title="ศูนย์แจ้งเตือน"
        subtitle={`${liveNotifications.length} รายการที่ต้องทราบ${pendingRemindersForMe.length > 0 ? ` · ${pendingRemindersForMe.length} รอยืนยันสั่งสินค้า` : ''}`}
        currentEmployee={employee}
      />
      <main className="space-y-4 px-4 py-4">
        {employee && <SendReminderSection stations={stations} employeeId={employee.id} />}

        {scopedReminders.length > 0 && (
          <section className="space-y-2.5">
            <p className="text-xs font-bold text-gray-500">📣 แจ้งเตือนให้สั่งสินค้า ({scopedReminders.length})</p>
            {scopedReminders.map((r) => {
              const station = stations.find((s) => s.id === r.stationId);
              const canRespond = canManage || (employee ? employee.stationId === r.stationId : false);
              return (
                <OrderReminderCard
                  key={r.id}
                  reminder={r}
                  stationName={station?.name ?? r.stationId}
                  employees={employees}
                  canRespond={canRespond}
                  actorId={employee?.id ?? ''}
                />
              );
            })}
          </section>
        )}

        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-status-dangerBg p-2 text-center">
            <p className="text-lg font-extrabold text-status-danger">{counts.blocked}</p>
            <p className="text-[10px] text-gray-500">ห้ามใช้</p>
          </div>
          <div className="rounded-xl bg-status-dangerBg p-2 text-center">
            <p className="text-lg font-extrabold text-status-danger">{counts.urgent}</p>
            <p className="text-[10px] text-gray-500">เร่งด่วน</p>
          </div>
          <div className="rounded-xl bg-status-warnBg p-2 text-center">
            <p className="text-lg font-extrabold text-status-warn">{counts.review}</p>
            <p className="text-[10px] text-gray-500">ควรตรวจสอบ</p>
          </div>
          <div className="rounded-xl bg-status-idleBg p-2 text-center">
            <p className="text-lg font-extrabold text-status-idle">{counts.info}</p>
            <p className="text-[10px] text-gray-500">ทั่วไป</p>
          </div>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {SEVERITY_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                tab === t.value ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="🔔" title="ไม่มีการแจ้งเตือนในหมวดนี้" subtitle="ทุกอย่างเรียบร้อยดี" />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((n) => {
              // รายการเสี่ยงจากเช็กลิสต์ใช้ relatedId เป็น checklist run id ไม่ใช่ stock item id — ลิงก์กลับไปหน้าเช็กลิสต์แทน
              const href = n.id.startsWith('live-checklist-risky-') ? '/checklist' : TYPE_LINK[n.type]?.(n.relatedId) ?? '/dashboard';
              return (
                <Link key={n.id} href={href} className="block rounded-2xl bg-white p-4 shadow-card active:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">{n.title}</p>
                    <SeverityBadge severity={n.severity} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{n.message}</p>
                  <p className="mt-2 text-[11px] text-gray-300">{formatThaiDateTime(n.createdAt)}</p>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// ส่งแจ้งเตือนให้แผนกสั่งสินค้า — ทุกตำแหน่งส่งได้ (เลือกแผนกไหนก็ได้) — เฟส 5
// ============================================================================
const ALL_STATIONS_VALUE = '__all__';

function SendReminderSection({ stations, employeeId }: { stations: Station[]; employeeId: string }) {
  const activeStations = stations.filter((s) => s.active);
  const [open, setOpen] = useState(false);
  const [stationId, setStationId] = useState(activeStations[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sendingAll = stationId === ALL_STATIONS_VALUE;

  async function handleSend() {
    if (!stationId) return;
    setSending(true);
    try {
      if (sendingAll) {
        // ส่งพร้อมกันทุกแผนกที่ยังใช้งานอยู่ — ยิงคำขอพร้อมกันทั้งหมดแล้วรอจนครบ
        await Promise.all(
          activeStations.map((s) => store.sendOrderReminder({ stationId: s.id, message: message.trim(), actorId: employeeId }))
        );
      } else {
        await store.sendOrderReminder({ stationId, message: message.trim(), actorId: employeeId });
      }
      setMessage('');
      setOpen(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">📣 แจ้งเตือนให้แผนกสั่งสินค้า</p>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-brand-600">
          {open ? 'ปิด' : '+ ส่งแจ้งเตือน'}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          >
            <option value={ALL_STATIONS_VALUE}>📣 ทุกแผนก (ส่งพร้อมกันทั้งหมด)</option>
            {activeStations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="ข้อความเพิ่มเติม (ไม่บังคับ) เช่น เตรียมของสำหรับวันหยุดยาว"
            rows={2}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          />
          <button
            onClick={handleSend}
            disabled={!stationId || sending}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {sending
              ? 'กำลังส่ง...'
              : sendingAll
                ? `ส่งแจ้งเตือนทุกแผนก (${activeStations.length} แผนก)`
                : 'ส่งแจ้งเตือน'}
          </button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-400">แผนกที่ได้รับแจ้งเตือนต้องกดยืนยันรับทราบกลับ ไม่ว่าจะมีของต้องสั่งหรือไม่ก็ตาม</p>
    </section>
  );
}

// ============================================================================
// การ์ดแจ้งเตือนให้สั่งสินค้าหนึ่งใบ — แสดงสถานะ + แบบฟอร์มยืนยันรับทราบ (เฉพาะแผนกเป้าหมาย/เจ้าของ/ผู้จัดการ)
// ============================================================================
function OrderReminderCard({
  reminder,
  stationName,
  employees,
  canRespond,
  actorId,
}: {
  reminder: OrderReminder;
  stationName: string;
  employees: Employee[];
  canRespond: boolean;
  actorId: string;
}) {
  const [responding, setResponding] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pending = !reminder.acknowledgedBy;

  async function handleConfirm() {
    if (choice === null || !actorId) return;
    setSaving(true);
    try {
      await store.acknowledgeOrderReminder(reminder.id, { willOrder: choice, note: note.trim() }, actorId);
      setResponding(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!actorId) return;
    if (!window.confirm('ต้องการลบการ์ดแจ้งเตือนนี้ใช่ไหม?')) return;
    setDeleting(true);
    try {
      await store.deleteOrderReminder(reminder.id, actorId);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`rounded-2xl p-4 shadow-card ${pending ? 'bg-status-dangerBg' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">{stationName}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            ส่งโดย {getEmployeeName(employees, reminder.createdBy)} · {formatThaiDateTime(reminder.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            pending ? 'bg-status-warnBg text-status-warn' : 'bg-status-okBg text-status-ok'
          }`}
        >
          {pending ? 'รอยืนยัน' : 'ยืนยันแล้ว'}
        </span>
      </div>

      {reminder.message && <p className="mt-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">{reminder.message}</p>}

      {!pending && (
        <p className="mt-2 text-xs text-gray-500">
          {reminder.willOrder ? '✅ จะสั่งสินค้า' : '➖ ไม่มีของต้องสั่ง'} · ยืนยันโดย {getEmployeeName(employees, reminder.acknowledgedBy)} ·{' '}
          {formatThaiDateTime(reminder.acknowledgedAt)}
          {reminder.responseNote && <> — {reminder.responseNote}</>}
        </p>
      )}

      {pending && canRespond && !responding && (
        <button onClick={() => setResponding(true)} className="mt-3 w-full rounded-xl bg-brand-600 py-2 text-xs font-bold text-white">
          ยืนยันรับทราบ
        </button>
      )}

      {pending && canRespond && responding && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setChoice(true)}
              className={`rounded-xl border py-2 text-xs font-semibold ${
                choice === true ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
              }`}
            >
              จะสั่งสินค้า
            </button>
            <button
              onClick={() => setChoice(false)}
              className={`rounded-xl border py-2 text-xs font-semibold ${
                choice === false ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
              }`}
            >
              ไม่มีของต้องสั่ง
            </button>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (ไม่บังคับ)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={choice === null || saving}
              className="flex-1 rounded-xl bg-brand-600 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </button>
            <button onClick={() => setResponding(false)} className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {pending && !canRespond && <p className="mt-2 text-[11px] text-gray-400">รอพนักงานแผนกนี้ยืนยันรับทราบ</p>}
      <button
        onClick={handleDelete}
        disabled={deleting || !actorId}
        className="mt-2 w-full rounded-xl bg-gray-100 py-1.5 text-[11px] font-semibold text-gray-500 disabled:opacity-40"
      >
        {deleting ? 'กำลังลบ...' : 'ลบการ์ดนี้'}
      </button>
    </div>
  );
}
