'use client';

import { useRouter, useParams } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/ui';
import { formatThaiDate, formatThaiDateTime, getEmployeeName } from '@/lib/derive';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  normal: { label: 'ปกติ', tone: 'bg-status-okBg text-status-ok' },
  near_expiry: { label: 'ใกล้หมดอายุ', tone: 'bg-status-warnBg text-status-warn' },
  used_up: { label: 'ใช้หมดแล้ว', tone: 'bg-status-idleBg text-status-idle' },
  unusable: { label: 'ใช้ไม่ได้', tone: 'bg-status-dangerBg text-status-danger' },
  expired: { label: 'หมดอายุ', tone: 'bg-status-dangerBg text-status-danger' },
  banned: { label: 'ห้ามใช้', tone: 'bg-red-50 text-red-600' },
  discarded: { label: 'ทิ้งแล้ว', tone: 'bg-gray-100 text-gray-600' },
  refilled: { label: 'ผลิตใหม่แล้ว', tone: 'bg-sky-50 text-sky-600' },
  production_failed: { label: 'ผลิตไม่ผ่าน', tone: 'bg-purple-50 text-purple-600' },
};

export default function ChecklistDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employee = useCurrentEmployee();
  const { checklistRuns, employees, stations } = useAppState();

  const run = checklistRuns.find((r) => r.id === params.id);
  const stationName = run ? stations.find((s) => s.id === run.stationId)?.name ?? run.stationId : '';

  return (
    <div>
      <Header
        title="รายละเอียดเช็กลิสต์"
        subtitle={run ? `${stationName} · ${formatThaiDate(run.date)}` : ''}
        currentEmployee={employee}
        onBack={() => router.back()}
      />
      <main className="space-y-3 px-4 py-4">
        {!run ? (
          <EmptyState title="ไม่พบข้อมูลเช็กลิสต์นี้" />
        ) : (
          <>
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="text-xs text-gray-500">ผู้ตรวจ</p>
              <p className="text-sm font-bold text-gray-900">{getEmployeeName(employees, run.submittedBy)}</p>
              <p className="mt-2 text-xs text-gray-500">เวลาที่ตรวจ</p>
              <p className="text-sm font-bold text-gray-900">{formatThaiDateTime(run.submittedAt)}</p>
              {run.backdated && (
                <div className="mt-2 rounded-lg bg-status-warnBg px-2.5 py-1.5 text-xs text-status-warn">
                  ⚠️ ทำย้อนหลัง{run.backdatedReason ? ` — เหตุผล: ${run.backdatedReason}` : ''}
                </div>
              )}
            </div>

            {run.items.map((item) => {
              const meta = STATUS_LABEL[item.status] ?? { label: item.status, tone: 'bg-gray-100 text-gray-600' };
              return (
                <div key={item.templateItemId} className="rounded-2xl bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                  </div>
                  {item.quantity !== null && <p className="mt-2 text-xs text-gray-500">จำนวน: {item.quantity}</p>}
                  {item.note && <p className="mt-2 text-xs text-gray-500">หมายเหตุ: {item.note}</p>}
                  {item.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photoUrl} alt={item.label} className="mt-2 h-24 w-24 rounded-xl object-cover" />
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
