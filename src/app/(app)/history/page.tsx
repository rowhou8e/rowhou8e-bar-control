'use client';

import { useMemo, useState } from 'react';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/ui';
import { formatThaiDateTime, getEmployeeName } from '@/lib/derive';
import type { HistoryActionType } from '@/lib/types';

const ACTION_LABELS: Record<HistoryActionType, string> = {
  order_reminder_send: 'ส่งแจ้งเตือนสั่งสินค้า',
  order_reminder_ack: 'ยืนยันรับทราบแจ้งเตือนสั่งสินค้า',
  checklist_submit: 'ทำเช็กลิสต์',
  production_log: 'บันทึกการผลิต',
  lot_status_change: 'เปลี่ยนสถานะล็อตสินค้า',
  stock_adjust: 'ปรับสต๊อก',
  waste_report: 'แจ้งของเสีย',
  purchase_create: 'สร้างรายการเสนอซื้อ',
  purchase_approve: 'อนุมัติคำสั่งซื้อ',
  purchase_receive: 'รับสินค้า',
  settings_change: 'เปลี่ยนการตั้งค่า',
  supplier_change: 'จัดการผู้ขาย/ราคา',
  po_create: 'สร้าง/รวมใบสั่งซื้อ',
  po_status_change: 'เปลี่ยนสถานะใบสั่งซื้อ',
  cash_report_submit: 'บันทึกรายงานเงินสด',
  cash_report_edit: 'แก้ไขรายงานเงินสด',
    po_price_update: 'แก้ไขราคาในใบสั่งซื้อ',
    po_item_add: 'เพิ่มรายการในใบสั่งซื้อ',
    po_item_remove: 'ลบรายการในใบสั่งซื้อ',
};

const ACTION_ICON: Record<HistoryActionType, string> = {
  order_reminder_send: '📣',
  order_reminder_ack: '🙋',
  checklist_submit: '📋',
  production_log: '🏭',
  lot_status_change: '🔄',
  stock_adjust: '📦',
  waste_report: '🗑️',
  purchase_create: '🛒',
  purchase_approve: '✅',
  purchase_receive: '📥',
  settings_change: '⚙️',
  supplier_change: '🏷️',
  po_create: '📦',
  po_status_change: '🚚',
  cash_report_submit: '💵',
  cash_report_edit: '✏️',
    po_price_update: '💰',
    po_item_add: '➕',
    po_item_remove: '➖',
};

export default function HistoryPage() {
  const employee = useCurrentEmployee();
  const { historyLogs, employees } = useAppState();

  const [query, setQuery] = useState('');
  const [actorFilter, setActorFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<HistoryActionType | 'all'>('all');
  const [dateFilter, setDateFilter] = useState('');

  const filtered = useMemo(() => {
    return historyLogs
      .filter((log) => (actorFilter === 'all' ? true : log.actorId === actorFilter))
      .filter((log) => (typeFilter === 'all' ? true : log.actionType === typeFilter))
      .filter((log) => (dateFilter ? log.createdAt.slice(0, 10) === dateFilter : true))
      .filter((log) =>
        query
          ? `${log.targetLabel} ${log.detail}`.toLowerCase().includes(query.toLowerCase())
          : true
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [historyLogs, actorFilter, typeFilter, dateFilter, query]);

  return (
    <div>
      <Header title="ประวัติการใช้งาน" subtitle="ค้นหาย้อนหลังได้ทุกรายการ" currentEmployee={employee} />
      <main className="space-y-3 px-4 py-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อสินค้า/รายละเอียด..."
          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-card outline-none focus:border-brand-400"
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none"
          >
            <option value="all">พนักงานทั้งหมด</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none"
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button
            onClick={() => setTypeFilter('all')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              typeFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
            }`}
          >
            ทุกประเภทงาน
          </button>
          {(Object.keys(ACTION_LABELS) as HistoryActionType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                typeFilter === t ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
              }`}
            >
              {ACTION_LABELS[t]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="🔍" title="ไม่พบประวัติที่ตรงกับเงื่อนไข" />
        ) : (
          <div className="space-y-2">
            {filtered.map((log) => (
              <div key={log.id} className="flex gap-3 rounded-2xl bg-white p-3.5 shadow-card">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 text-base">
                  {ACTION_ICON[log.actionType]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {ACTION_LABELS[log.actionType]} · {log.targetLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{log.detail}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    โดย {getEmployeeName(employees, log.actorId)} · {formatThaiDateTime(log.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="pt-2 text-center text-[11px] text-gray-300">
          🔒 ประวัติทั้งหมดเป็นแบบอ่านอย่างเดียว ไม่สามารถแก้ไขหรือลบได้จากหน้านี้
        </p>
      </main>
    </div>
  );
}
