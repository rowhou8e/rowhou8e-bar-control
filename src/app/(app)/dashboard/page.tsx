'use client';

import Link from 'next/link';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import {
  formatThaiDateTime,
  formatThaiTime,
  getEmployeeName,
  hoursUntil,
  isChecklistOverdue,
  roleLabel,
  toDateStr,
} from '@/lib/derive';

function StatTile({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  tone: 'ok' | 'warn' | 'danger' | 'idle';
  href: string;
}) {
  const toneBg: Record<string, string> = {
    ok: 'bg-status-okBg',
    warn: 'bg-status-warnBg',
    danger: 'bg-status-dangerBg',
    idle: 'bg-status-idleBg',
  };
  const toneText: Record<string, string> = {
    ok: 'text-status-ok',
    warn: 'text-status-warn',
    danger: 'text-status-danger',
    idle: 'text-status-idle',
  };
  return (
    <Link href={href} className={`rounded-2xl p-3.5 ${toneBg[tone]} active:opacity-80`}>
      <p className={`text-2xl font-extrabold ${toneText[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-600">{label}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const state = useAppState();
  const employee = useCurrentEmployee();
  const {
    employees,
    stations,
    products,
    productLots,
    purchaseOrders,
    cashReports,
    checklistRuns,
    settings,
    storeHolidays,
    now,
  } = state;

  const todayStr = toDateStr(now);
  const activeStations = stations.filter((s) => s.active).sort((a, b) => a.order - b.order);
  const stationStatuses = activeStations.map((station) => {
    const todayRun = checklistRuns.find((r) => r.stationId === station.id && r.date === todayStr);
    return { station, todayRun, overdue: isChecklistOverdue(settings, todayRun, now, storeHolidays) };
  });
  const doneCount = stationStatuses.filter((s) => s.todayRun?.submittedAt).length;
  const anyOverdue = stationStatuses.some((s) => !s.todayRun?.submittedAt && s.overdue);

  const notReceivedOrders = purchaseOrders.filter((po) => po.status === 'sent' || po.status === 'confirmed').length;
  // สรุปการเงิน — เจ้าของร้านเท่านั้น (ผู้จัดการทำได้ทุกอย่างยกเว้นส่วนนี้)
  const canManageCash = employee?.role === 'owner';
  const todayCashReport = cashReports.find((r) => r.date === todayStr);

  const activeLots = productLots
    .filter((l) => l.status === 'active' || l.status === 'near_expiry')
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const staffTasks: { label: string; done: boolean; href: string }[] = [
    { label: 'ทำเช็กลิสต์วันนี้ (ทุกแผนก)', done: doneCount === stationStatuses.length, href: '/checklist' },
    {
      label: 'ตรวจล็อตสินค้าที่ใกล้/หมดอายุ',
      done: productLots.every((l) => l.status !== 'expired' && l.status !== 'near_expiry'),
      href: '/milk',
    },
  ];

  return (
    <div>
      <Header
        title={`สวัสดี ${employee?.nickname ?? ''} 👋`}
        subtitle={`${roleLabel(employee?.role ?? 'staff')} · วันนี้ ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}`}
        currentEmployee={employee}
      />

      <main className="space-y-5 px-4 py-4">
        {/* สถานะเช็กลิสต์วันนี้ — แยกตามบาร์ */}
        <section
          className={`rounded-2xl p-4 shadow-card ${
            doneCount === stationStatuses.length ? 'bg-status-okBg' : anyOverdue ? 'bg-status-dangerBg' : 'bg-status-idleBg'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">เช็กลิสต์วันนี้ (ทุกแผนก)</p>
            <Link href="/checklist" className="text-xs font-semibold text-brand-600">
              ดูทั้งหมด
            </Link>
          </div>
          <p className="mt-1 text-lg font-extrabold text-gray-900">
            ทำแล้ว {doneCount}/{stationStatuses.length} แผนก
          </p>
          <div className="mt-2 space-y-1.5">
            {stationStatuses.map(({ station, todayRun, overdue }) => (
              <div key={station.id} className="flex items-center justify-between rounded-xl bg-white/70 px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      todayRun?.submittedAt ? 'bg-status-ok' : overdue ? 'bg-status-danger' : 'bg-status-idle'
                    }`}
                  />
                  {station.name}
                </span>
                {todayRun?.submittedAt ? (
                  <span className="text-[11px] text-gray-500">
                    {getEmployeeName(employees, todayRun.submittedBy)} · {formatThaiTime(todayRun.submittedAt)}
                  </span>
                ) : (
                  <Link href={`/checklist/new?station=${station.id}`} className="text-[11px] font-bold text-brand-600">
                    ทำเลย →
                  </Link>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">กำหนดตรวจให้เสร็จก่อน {settings.checklistDueTime} น.</p>
        </section>

        {/* สรุปตัวเลขวันนี้ */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="ใบสั่งซื้อรอรับสินค้า" value={notReceivedOrders} tone={notReceivedOrders > 0 ? 'warn' : 'ok'} href="/purchase-orders" />
            {canManageCash && (
              <StatTile
                label="รายงานเงินสดวันนี้"
                value={todayCashReport ? '✓ บันทึกแล้ว' : 'ยังไม่บันทึก'}
                tone={todayCashReport ? 'ok' : 'warn'}
                href="/cash-report"
              />
            )}
          </div>
        </section>

        {/* ล็อตสินค้าที่ผลิต */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">ล็อตสินค้า — ที่ใช้งานอยู่</h2>
            <Link href="/milk" className="text-xs font-semibold text-brand-600">
              ดูทั้งหมด
            </Link>
          </div>
          {activeLots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
              ไม่มีล็อตสินค้าที่ใช้งานอยู่ในขณะนี้
            </div>
          ) : (
            <div className="space-y-2">
              {activeLots.map((lot) => {
                const product = products.find((p) => p.id === lot.productId);
                const hrs = hoursUntil(lot.expiresAt, now);
                const daysLeft = Math.floor(hrs / 24);
                const hoursLeft = Math.max(0, Math.floor(hrs % 24));
                return (
                  <div key={lot.id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-card">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {product?.name ?? 'สินค้า'} · ล็อต {lot.lotNumber}
                      </p>
                      <p className="text-xs text-gray-500">
                        {lot.quantity} {lot.unit} · ผลิตโดย {getEmployeeName(employees, lot.producedBy)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {hrs > 0 ? `เหลืออีก ${daysLeft > 0 ? `${daysLeft} วัน ` : ''}${hoursLeft} ชม.` : 'หมดอายุแล้ว'}
                      </p>
                    </div>
                    <StatusBadge status={lot.status} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* งานที่ยังไม่ได้ทำ */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-gray-700">งานที่ยังไม่ได้ทำ</h2>
          <div className="space-y-2">
            {staffTasks
              .filter((t) => !t.done)
              .map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-card active:bg-gray-50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-status-idle" />
                    {t.label}
                  </span>
                  <span className="text-gray-300">›</span>
                </Link>
              ))}
            {staffTasks.every((t) => t.done) && (
              <div className="rounded-2xl bg-status-okBg p-3.5 text-center text-sm font-semibold text-status-ok">
                🎉 วันนี้ทำงานครบทุกอย่างแล้ว
              </div>
            )}
          </div>
        </section>

        <p className="pt-1 text-center text-[11px] text-gray-300">
          ทั้งหมด {activeStations.length} แผนก · อัปเดตล่าสุด {formatThaiDateTime(now.toISOString())}
        </p>
      </main>
    </div>
  );
}
