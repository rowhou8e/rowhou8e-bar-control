import { statusMeta, severityMeta } from '@/lib/derive';
import type { ItemStatus, ProductLotStatus, NotificationSeverity, PurchaseRequestStatus, PurchaseOrderStatus } from '@/lib/types';

const toneClasses: Record<'ok' | 'warn' | 'danger' | 'idle', string> = {
  ok: 'bg-status-okBg text-status-ok',
  warn: 'bg-status-warnBg text-status-warn',
  danger: 'bg-status-dangerBg text-status-danger',
  idle: 'bg-status-idleBg text-status-idle',
};

export function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'idle' }) {
  const dot: Record<string, string> = {
    ok: 'bg-status-ok',
    warn: 'bg-status-warn',
    danger: 'bg-status-danger',
    idle: 'bg-status-idle',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot[tone]}`} />;
}

export function StatusBadge({ status }: { status: ItemStatus | ProductLotStatus }) {
  const meta = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[meta.tone]}`}>
      <StatusDot tone={meta.tone} />
      {meta.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: NotificationSeverity }) {
  const meta = severityMeta(severity);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[meta.tone]}`}>
      <StatusDot tone={meta.tone} />
      {meta.label}
    </span>
  );
}

const prLabels: Record<PurchaseRequestStatus, { label: string; tone: 'ok' | 'warn' | 'danger' | 'idle' }> = {
  pending: { label: 'รออนุมัติ', tone: 'warn' },
  approved: { label: 'อนุมัติแล้ว', tone: 'ok' },
  ordered: { label: 'สั่งซื้อแล้ว', tone: 'idle' },
  received: { label: 'รับสินค้าแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'danger' },
};

export function PurchaseStatusBadge({ status }: { status: PurchaseRequestStatus }) {
  const meta = prLabels[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[meta.tone]}`}>
      <StatusDot tone={meta.tone} />
      {meta.label}
    </span>
  );
}

const poLabels: Record<PurchaseOrderStatus, { label: string; tone: 'ok' | 'warn' | 'danger' | 'idle' }> = {
  draft: { label: 'ร่าง', tone: 'idle' },
  sent: { label: 'ส่งให้ผู้ขายแล้ว', tone: 'warn' },
  confirmed: { label: 'ผู้ขายยืนยันแล้ว', tone: 'warn' },
  received: { label: 'รับสินค้าแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'danger' },
};

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const meta = poLabels[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[meta.tone]}`}>
      <StatusDot tone={meta.tone} />
      {meta.label}
    </span>
  );
}
