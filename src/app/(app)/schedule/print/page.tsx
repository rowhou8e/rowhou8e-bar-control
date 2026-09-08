'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { formatThaiDateTime, toDateStr } from '@/lib/derive';
import { WEEKDAY_FULL, buildMonthGrid, employeesOffOnDate, monthLabel, specialDaysForDate } from '@/lib/calendar-derive';

/** ความกว้างชีทตาราง — ตรงกับขนาดกระดาษ A4 แนวนอนที่ตั้งไว้ใน @page ด้านล่าง (~96dpi) */
const SHEET_WIDTH_PX = 1123;

export default function SchedulePrintPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { employees, weeklyPatterns, workCalendarEntries, specialDays, now } = useAppState();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);
  const weeks = useMemo(() => buildMonthGrid(year, month0), [year, month0]);
  const todayStr = toDateStr(now);

  function goMonth(delta: number) {
    let m = month0 + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth0(m);
    setYear(y);
  }

  function roleAbbrev(role: string): string {
    if (role === 'owner') return 'จนง.';
    if (role === 'manager') return 'ผจก.';
    return '';
  }

  async function handleExportImage() {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      // ก็อปปี้ที่ซ่อนไว้กว้างคงที่เท่ากระดาษ A4 แนวนอนเสมอ ไม่ขึ้นกับความกว้างจอมือถือ
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ตารางกะ_${monthLabel(year, month0).replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      window.alert('สร้างรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setExporting(false);
    }
  }

  /** เนื้อหาชีทตารางเดือน — ใช้ซ้ำทั้งพรีวิวบนจอ (responsive) และก็อปปี้ซ่อนไว้สำหรับเอ็กซ์พอร์ตรูป (กว้างคงที่ A4) */
  function renderSheet() {
    return (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '2px solid #111827',
            paddingBottom: '12px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#424242',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: '16px',
              }}
            >
              R
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#111827' }}>Rowhouse Cafe</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#6B7280' }}>ตารางการทำงานประจำเดือน</p>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#111827' }}>{monthLabel(year, month0)}</p>
          <div style={{ textAlign: 'right', fontSize: '10.5px', color: '#9CA3AF' }}>
            <p style={{ margin: 0 }}>พิมพ์เมื่อ {formatThaiDateTime(now.toISOString())}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '6px', marginBottom: '6px' }}>
          {WEEKDAY_FULL.map((label, i) => (
            <div
              key={label}
              style={{
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: i === 0 ? '#DC2626' : i === 6 ? '#2563EB' : '#374151',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '6px' }}>
          {weeks.flat().map((cell, idx) => {
            if (!cell.inMonth || !cell.dateStr) {
              return (
                <div
                  key={idx}
                  style={{
                    border: '1px solid #F3F4F6',
                    borderRadius: '6px',
                    minHeight: '78px',
                    padding: '5px 7px',
                    background: '#FAFAFA',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#D1D5DB' }}>{cell.date?.getDate()}</span>
                </div>
              );
            }
            const dateStr = cell.dateStr;
            const isToday = dateStr === todayStr;
            const badges = specialDaysForDate(dateStr, specialDays);
            const offList = employeesOffOnDate(dateStr, cell.weekday, activeEmployees, weeklyPatterns, workCalendarEntries);
            const names = offList
              .map(({ employee: e }) => (e.role === 'staff' ? e.nickname : `${e.nickname} (${roleAbbrev(e.role)})`))
              .join(', ');

            return (
              <div
                key={idx}
                style={{
                  border: isToday ? '2px solid #424242' : '1px solid #E5E7EB',
                  borderRadius: '6px',
                  minHeight: '78px',
                  padding: '5px 7px',
                  background: isToday || badges.length > 0 ? '#F5F5F5' : '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: isToday ? 800 : 700,
                      color: isToday ? '#424242' : cell.weekday === 0 || cell.weekday === 6 ? '#2563EB' : '#374151',
                    }}
                  >
                    {cell.date?.getDate()}
                  </span>
                  {isToday && <span style={{ fontSize: '8px', fontWeight: 700, color: '#424242' }}>วันนี้</span>}
                  {!isToday &&
                    badges[0] &&
                    (() => {
                      const c =
                        badges[0].dayType === 'วันหยุดราชการ'
                          ? { bg: '#FEE2E2', text: '#991B1B' }
                          : badges[0].dayType === 'วันพระ'
                            ? { bg: '#FFEDD5', text: '#9A3412' }
                            : { bg: '#FEF3C7', text: '#92400E' };
                      return (
                        <span
                          style={{
                            fontSize: '8px',
                            fontWeight: 700,
                            color: c.text,
                            background: c.bg,
                            borderRadius: '999px',
                            padding: '1px 6px',
                          }}
                        >
                          {badges[0].label || badges[0].dayType}
                        </span>
                      );
                    })()}
                </div>
                {names && (
                  <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#6B7280', lineHeight: 1.5 }}>หยุด: {names}</p>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid #F3F4F6',
            display: 'flex',
            gap: '16px',
            fontSize: '10.5px',
            color: '#6B7280',
          }}
        >
          <LegendDot color="#DC2626" label="วันหยุดราชการ" />
          <LegendDot color="#EA580C" label="วันพระ" />
          <LegendDot color="#D97706" label="วันสำคัญ" />
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button onClick={() => router.back()} className="text-sm font-semibold text-gray-500">
          ‹ กลับ
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => goMonth(-1)} className="rounded-full border border-gray-200 px-2.5 py-1 text-sm">
            ‹
          </button>
          <span className="text-sm font-bold text-gray-900">{monthLabel(year, month0)}</span>
          <button onClick={() => goMonth(1)} className="rounded-full border border-gray-200 px-2.5 py-1 text-sm">
            ›
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportImage}
            className="rounded-lg border-[1.5px] border-brand-600 px-2.5 py-1.5 text-[12.5px] font-bold text-brand-600 active:bg-brand-50 disabled:opacity-50"
          >
            {exporting ? 'กำลังสร้าง...' : 'บันทึกรูป'}
          </button>
          <button onClick={() => window.print()} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[12.5px] font-bold text-white">
            พิมพ์ / PDF
          </button>
        </div>
      </div>

      <main style={{ padding: '0 16px 24px' }}>
        <div
          style={{
            width: '100%',
            maxWidth: `${SHEET_WIDTH_PX}px`,
            margin: '0 auto',
            background: '#ffffff',
            padding: '28px 32px 20px',
            fontFamily: "'Noto Sans Thai', system-ui, sans-serif",
            boxSizing: 'border-box',
          }}
        >
          {renderSheet()}
        </div>
      </main>

      {/*
        ก็อปปี้ซ่อนไว้นอกจอ กว้างคงที่เท่ากระดาษ A4 แนวนอนเสมอ (ไม่หดตามจอมือถือแบบพรีวิวด้านบน)
        ใช้เป็นต้นทางตอนกดปุ่ม "บันทึกรูป" เพื่อให้ได้ไฟล์ภาพสัดส่วน A4 แนวนอนเต็ม ไม่ว่าจะเปิดจากจอขนาดไหน
      */}
      <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: '-99999px', width: `${SHEET_WIDTH_PX}px`, pointerEvents: 'none' }}>
        <div
          ref={exportRef}
          style={{
            width: `${SHEET_WIDTH_PX}px`,
            background: '#ffffff',
            padding: '28px 32px 20px',
            fontFamily: "'Noto Sans Thai', system-ui, sans-serif",
            boxSizing: 'border-box',
          }}
        >
          {renderSheet()}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          .no-print { display: none !important; }
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '999px', background: color }} />
      {label}
    </span>
  );
}
