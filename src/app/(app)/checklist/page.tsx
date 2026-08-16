'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { EmptyState, PrimaryButton } from '@/components/ui';
import { formatThaiDate, formatThaiTime, getEmployeeName, isChecklistOverdue, toDateStr } from '@/lib/derive';

export default function ChecklistPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { employees, stations, checklistRuns, checklistTemplate, settings, storeHolidays, now } = useAppState();
  const [stationFilter, setStationFilter] = useState<string>('all');

  const todayStr = toDateStr(now);
  const activeStations = stations.filter((s) => s.active).sort((a, b) => a.order - b.order);
  const myStationId = employee?.stationId ?? null;

  const history = checklistRuns
    .filter((r) => r.date !== todayStr && r.submittedAt)
    .filter((r) => stationFilter === 'all' || r.stationId === stationFilter)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  function stationName(stationId: string) {
    return stations.find((s) => s.id === stationId)?.name ?? stationId;
  }

  return (
    <div>
      <Header title="เช็กลิสต์ประจำวัน" subtitle="แต่ละแผนกแยกเช็กของตัวเอง" currentEmployee={employee} />
      <main className="space-y-5 px-4 py-4">
        <section>
          <h2 className="mb-2 text-sm font-bold text-gray-700">สถานะวันนี้ — ทุกแผนก</h2>
          <div className="space-y-2.5">
            {activeStations.map((station) => {
              const todayRun = checklistRuns.find((r) => r.stationId === station.id && r.date === todayStr);
              const overdue = isChecklistOverdue(settings, todayRun, now, storeHolidays);
              const isMine = station.id === myStationId;
              const itemCount = checklistTemplate.filter((t) => t.stationId === station.id && t.active).length;

              return (
                <div
                  key={station.id}
                  className={`rounded-2xl p-4 shadow-card ${
                    todayRun?.submittedAt ? 'bg-status-okBg' : overdue ? 'bg-status-dangerBg' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-bold text-gray-900">{station.name}</p>
                        {isMine && (
                          <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                            แผนกของฉัน
                          </span>
                        )}
                      </div>
                      {todayRun?.submittedAt ? (
                        <p className="mt-1 text-xs text-status-ok">
                          ✓ ตรวจแล้ว โดย {getEmployeeName(employees, todayRun.submittedBy)} · {formatThaiTime(todayRun.submittedAt)}
                        </p>
                      ) : (
                        <p className={`mt-1 text-xs ${overdue ? 'text-status-danger font-semibold' : 'text-gray-500'}`}>
                          {overdue ? 'เลยเวลาแล้ว ยังไม่ได้ตรวจ' : `ยังไม่ได้ตรวจ (${itemCount} ข้อ)`}
                        </p>
                      )}
                    </div>
                    {todayRun?.submittedAt ? (
                      <Link href={`/checklist/${todayRun.id}`} className="shrink-0 text-xs font-semibold text-brand-600">
                        ดูรายละเอียด
                      </Link>
                    ) : (
                      <button
                        onClick={() => router.push(`/checklist/new?station=${station.id}`)}
                        className="shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white active:bg-brand-700"
                      >
                        ทำเลย
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {employee?.role === 'staff' && !myStationId && (
            <p className="mt-2 text-center text-[11px] text-gray-400">
              คุณยังไม่ถูกกำหนดแผนกที่ประจำ — เลือกทำเช็กลิสต์แผนกไหนก็ได้ หรือแจ้งเจ้าของร้านให้กำหนดแผนกให้
            </p>
          )}
        </section>

        {(employee?.role === 'owner' || employee?.role === 'manager') && (
          <section>
            <div className="rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-4">
              <p className="text-sm font-bold text-brand-700">ทำเช็กลิสต์ย้อนหลัง</p>
              <p className="mt-1 text-xs text-brand-600">เฉพาะผู้จัดการ/เจ้าของร้าน — ต้องระบุเหตุผลเสมอ (ห้ามพนักงานทำย้อนหลัง)</p>
              <BackdateForm stations={activeStations} maxDate={todayStr} />
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">ประวัติย้อนหลัง</h2>
          </div>
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <button
              onClick={() => setStationFilter('all')}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                stationFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
              }`}
            >
              ทุกแผนก
            </button>
            {activeStations.map((s) => (
              <button
                key={s.id}
                onClick={() => setStationFilter(s.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  stationFilter === s.id ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          {history.length === 0 ? (
            <EmptyState icon="🗂️" title="ยังไม่มีประวัติเช็กลิสต์" />
          ) : (
            <div className="space-y-2">
              {history.map((run) => {
                const problemCount = run.items.filter((i) => i.status !== 'normal').length;
                return (
                  <Link
                    key={run.id}
                    href={`/checklist/${run.id}`}
                    className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-card active:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900">
                        {stationName(run.stationId)} · {formatThaiDate(run.date)}
                        {run.backdated && <span className="ml-1.5 text-[10px] font-semibold text-status-warn">(ย้อนหลัง)</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        โดย {getEmployeeName(employees, run.submittedBy)} · {formatThaiTime(run.submittedAt)}
                      </p>
                    </div>
                    {problemCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-status-warnBg px-2.5 py-1 text-xs font-semibold text-status-warn">
                        {problemCount} รายการ
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-status-okBg px-2.5 py-1 text-xs font-semibold text-status-ok">ปกติทั้งหมด</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {myStationId && !checklistRuns.find((r) => r.stationId === myStationId && r.date === todayStr)?.submittedAt && (
          <div className="sticky bottom-3">
            <PrimaryButton onClick={() => router.push(`/checklist/new?station=${myStationId}`)}>
              ทำเช็กลิสต์ {stationName(myStationId)}
            </PrimaryButton>
          </div>
        )}
      </main>
    </div>
  );
}

/** ฟอร์มเล็ก ๆ ให้ manager/owner เลือกแผนก + วันที่ย้อนหลัง แล้วไปหน้ากรอกเช็กลิสต์ (ต้องระบุเหตุผลในหน้าถัดไป) */
function BackdateForm({ stations, maxDate }: { stations: { id: string; name: string }[]; maxDate: string }) {
  const router = useRouter();
  const [station, setStation] = useState(stations[0]?.id ?? '');
  const [date, setDate] = useState('');

  return (
    <div className="mt-3 space-y-2">
      <select
        value={station}
        onChange={(e) => setStation(e.target.value)}
        className="w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
      >
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        max={maxDate}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
      />
      <button
        disabled={!station || !date}
        onClick={() => router.push(`/checklist/new?station=${station}&date=${date}`)}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white active:bg-brand-700 disabled:opacity-40"
      >
        ไปทำเช็กลิสต์ย้อนหลัง
      </button>
    </div>
  );
}
