'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { generateLiveNotifications, liveNotificationStationId } from '@/lib/derive';

const navItems = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: HomeIcon },
  { href: '/checklist', label: 'เช็กลิสต์', icon: ChecklistIcon },
  { href: '/milk', label: 'ล็อตสินค้า', icon: MilkIcon },
  { href: '/order', label: 'สั่งสินค้า', icon: OrderIcon },
  { href: '/notifications', label: 'แจ้งเตือน', icon: BellIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const state = useAppState();
  const employee = useCurrentEmployee();
  const canManage = employee?.role === 'owner' || employee?.role === 'manager';
  const liveNotificationsAll = generateLiveNotifications({
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
  });
  const liveNotifications =
    canManage || !employee
      ? liveNotificationsAll
      : liveNotificationsAll.filter((n) => {
          const stationId = liveNotificationStationId(n, {
            checklistRuns: state.checklistRuns,
            productLots: state.productLots,
            products: state.products,
          });
          return stationId !== null && stationId === employee.stationId;
        });
  const scopedReminders =
    canManage || !employee ? state.orderReminders : state.orderReminders.filter((r) => r.stationId === employee.stationId);
  const pendingReminderCount = scopedReminders.filter((r) => !r.acknowledgedBy).length;
  const urgentCount = liveNotifications.filter((n) => n.severity === 'urgent' || n.severity === 'blocked').length + pendingReminderCount;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-nav backdrop-blur">
      <div className="grid grid-cols-5">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                active ? 'text-brand-600' : 'text-gray-400'
              }`}
            >
              <Icon active={!!active} />
              {item.href === '/notifications' && urgentCount > 0 && (
                <span className="absolute right-[28%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[9px] font-bold text-white">
                  {urgentCount}
                </span>
              )}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function iconBase(active: boolean) {
  return active ? '#EA580C' : '#9CA3AF';
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconBase(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function ChecklistIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconBase(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
function MilkIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconBase(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6M10 2v4l-3 4v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10l-3-4V2" />
    </svg>
  );
}
function OrderIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconBase(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6h15l-1.5 9h-12L6 6Z" />
      <path d="M6 6 5 3H2" />
      <circle cx="10" cy="20" r="1.4" fill={iconBase(active)} stroke="none" />
      <circle cx="17" cy="20" r="1.4" fill={iconBase(active)} stroke="none" />
    </svg>
  );
}
function BellIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconBase(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
