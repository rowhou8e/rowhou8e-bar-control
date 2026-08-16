'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState, PrimaryButton } from '@/components/ui';
import { formatThaiDateTime, getEmployeeName, hoursUntil } from '@/lib/derive';
import type { ProductLotStatus } from '@/lib/types';

const FILTERS: { value: ProductLotStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'active', label: 'ใช้งานอยู่' },
  { value: 'near_expiry', label: 'ใกล้หมดอายุ' },
  { value: 'expired', label: 'หมดอายุ' },
  { value: 'used_up', label: 'ใช้หมดแล้ว' },
  { value: 'discarded', label: 'ทิ้งแล้ว' },
];

/** หน้า "ล็อตสินค้า" — แทนหน้านมต้มเดิม ใช้ได้กับทุกแผนกที่มีการผลิต (ครัวขนม/ครัวผลิตขนมปัง/ครัวบาร์น้ำ) */
export default function ProductLotsPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { productLots, products, stations, employees, now } = useAppState();
  const [filter, setFilter] = useState<ProductLotStatus | 'all'>('all');
  const [stationFilter, setStationFilter] = useState<string>('all');

  const productionStations = useMemo(() => stations.filter((s) => s.hasProduction), [stations]);

  const sorted = [...productLots].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const filtered = sorted.filter((lot) => {
    if (filter !== 'all' && lot.status !== filter) return false;
    if (stationFilter !== 'all') {
      const product = products.find((p) => p.id === lot.productId);
      if (product?.stationId !== stationFilter) return false;
    }
    return true;
  });

  return (
    <div>
      <Header title="ล็อตสินค้า" subtitle="บันทึกและติดตามอายุสินค้าที่ผลิต (FIFO/FEFO)" currentEmployee={employee} />
      <main className="space-y-4 px-4 py-4">
        <PrimaryButton onClick={() => router.push('/milk/new')}>+ บันทึกล็อตการผลิตใหม่</PrimaryButton>

        {productionStations.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button
              onClick={() => setStationFilter('all')}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                stationFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 shadow-card'
              }`}
            >
              ทุกแผนก
            </button>
            {productionStations.map((s) => (
              <button
                key={s.id}
                onClick={() => setStationFilter(s.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  stationFilter === s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 shadow-card'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                filter === f.value ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="📦" title="ไม่พบล็อตสินค้าในหมวดนี้" />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((lot) => {
              const product = products.find((p) => p.id === lot.productId);
              const hrs = hoursUntil(lot.expiresAt, now);
              const canUseUp = lot.status === 'active' || lot.status === 'near_expiry';
              // เห็นรูปภาพได้เฉพาะคนที่บันทึกล็อตนั้นเอง หรือ owner/manager ที่เห็นได้ทุกล็อต
              const canSeePhoto =
                !!employee && (employee.id === lot.producedBy || employee.role === 'owner' || employee.role === 'manager');
              return (
                <div key={lot.id} className="rounded-2xl bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900">
                        {product?.name ?? 'สินค้า'} · ล็อต {lot.lotNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {lot.quantity} {lot.unit} · ผลิตโดย {getEmployeeName(employees, lot.producedBy)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      {lot.photoUrl && canSeePhoto && (
                        <a href={lot.photoUrl} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={lot.photoUrl}
                            alt={`รูปล็อต ${lot.lotNumber}`}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        </a>
                      )}
                      <StatusBadge status={lot.status} />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400">ผลิตเมื่อ</p>
                      <p className="font-medium text-gray-700">{formatThaiDateTime(lot.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">หมดอายุ</p>
                      <p className={`font-medium ${hrs < 0 ? 'text-status-danger' : 'text-gray-700'}`}>
                        {formatThaiDateTime(lot.expiresAt)}
                      </p>
                    </div>
                  </div>
                  {lot.note && <p className="mt-2 text-xs text-gray-500">หมายเหตุ: {lot.note}</p>}
                  {lot.status === 'expired' && (
                    <p className="mt-2 rounded-lg bg-status-dangerBg px-2.5 py-1.5 text-xs font-bold text-status-danger">
                      ⚠️ ห้ามใช้ — หมดอายุแล้ว
                    </p>
                  )}
                  {canUseUp && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => employee && store.setProductLotStatus(lot.id, 'used_up', employee.id)}
                        className="flex-1 rounded-xl bg-gray-100 py-2 text-xs font-bold text-gray-700 active:bg-gray-200"
                      >
                        ใช้หมดแล้ว
                      </button>
                      <button
                        onClick={() => employee && store.setProductLotStatus(lot.id, 'discarded', employee.id)}
                        className="flex-1 rounded-xl bg-status-dangerBg py-2 text-xs font-bold text-status-danger active:bg-red-200"
                      >
                        ทิ้ง
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-300">
          <Link href="/history?type=production_log">ดูประวัติการผลิตทั้งหมด →</Link>
        </p>
      </main>
    </div>
  );
}
