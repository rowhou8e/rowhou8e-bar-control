import type { Employee, SpecialDay, Weekday, WorkCalendarEntry, WorkCalendarStatus, WeeklyPatternEntry } from './types';
import { toDateStr } from './derive';

export const WEEKDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const WEEKDAY_FULL = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

/** ผลลัพธ์สถานะของพนักงาน 1 คนในวันที่กำหนด — รวม pattern + ข้อยกเว้นแล้ว */
export interface EffectiveDayStatus {
  status: WorkCalendarStatus;
  /** exception = มีแถวใน work_calendar_entries ของวันนี้ / pattern = มาจากวันหยุดประจำสัปดาห์ / default = ไม่มีข้อมูล (ทำงานปกติ) */
  source: 'exception' | 'pattern' | 'default';
  entry: WorkCalendarEntry | null;
}

/** หาสถานะจริงของพนักงาน 1 คนในวันที่กำหนด: ข้อยกเว้นเฉพาะวันชนะเสมอ, รองลงมาคือวันหยุดประจำสัปดาห์, ค่าเริ่มต้นคือวันทำงาน */
export function effectiveStatus(
  employeeId: string,
  dateStr: string,
  weekday: Weekday,
  weeklyPatterns: WeeklyPatternEntry[],
  workCalendarEntries: WorkCalendarEntry[]
): EffectiveDayStatus {
  const entry = workCalendarEntries.find((e) => e.employeeId === employeeId && e.date === dateStr) ?? null;
  if (entry) return { status: entry.status, source: 'exception', entry };

  const pattern = weeklyPatterns.find((p) => p.employeeId === employeeId && p.weekday === weekday);
  if (pattern?.isDayOff) return { status: 'off', source: 'pattern', entry: null };

  return { status: 'work', source: 'default', entry: null };
}

export interface DayOffInfo {
  employee: Employee;
  effective: EffectiveDayStatus;
}

/** รายชื่อพนักงานทุกคนที่หยุดในวันที่กำหนด (ทั้งจาก pattern และข้อยกเว้น) */
export function employeesOffOnDate(
  dateStr: string,
  weekday: Weekday,
  employees: Employee[],
  weeklyPatterns: WeeklyPatternEntry[],
  workCalendarEntries: WorkCalendarEntry[]
): DayOffInfo[] {
  return employees
    .map((employee) => ({ employee, effective: effectiveStatus(employee.id, dateStr, weekday, weeklyPatterns, workCalendarEntries) }))
    .filter((x) => x.effective.status === 'off');
}

export interface MonthCell {
  date: Date | null;
  dateStr: string | null;
  weekday: Weekday;
  inMonth: boolean;
}

/** สร้างตารางเดือน (array ของสัปดาห์ๆ ละ 7 ช่อง) เริ่มวันอาทิตย์ รวมช่องว่างก่อน/หลังเดือนให้ครบสัปดาห์ */
export function buildMonthGrid(year: number, month0: number): MonthCell[][] {
  const firstOfMonth = new Date(year, month0, 1);
  const startWeekday = firstOfMonth.getDay() as Weekday;
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();

  const cells: MonthCell[] = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: null, dateStr: null, weekday: i as Weekday, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month0, d);
    cells.push({ date, dateStr: toDateStr(date), weekday: date.getDay() as Weekday, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const weekday = (cells.length % 7) as Weekday;
    cells.push({ date: null, dateStr: null, weekday, inMonth: false });
  }

  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function specialDaysForDate(dateStr: string, specialDays: SpecialDay[]): SpecialDay[] {
  return specialDays.filter((s) => s.date === dateStr);
}

/** สีของ badge ตามประเภทวันสำคัญ — ใช้ทั้งจุดสีในปฏิทินและป้ายในโหมดพิมพ์ */
export function specialDayColor(dayType: SpecialDay['dayType']): { dot: string; text: string; bg: string; border: string } {
  switch (dayType) {
    case 'วันหยุดราชการ':
      return { dot: '#DC2626', text: '#991B1B', bg: '#FEE2E2', border: '#FECACA' };
    case 'วันพระ':
      return { dot: '#EA580C', text: '#9A3412', bg: '#FFEDD5', border: '#FED7AA' };
    case 'วันสำคัญ':
    default:
      return { dot: '#D97706', text: '#92400E', bg: '#FEF3C7', border: '#FDE68A' };
  }
}

/** หาแถวคู่สลับกะของ entry นี้ (อีกฝั่งของ swapPairId เดียวกัน) */
export function swapPartnerEntry(entry: WorkCalendarEntry, workCalendarEntries: WorkCalendarEntry[]): WorkCalendarEntry | null {
  if (!entry.swapPairId) return null;
  return workCalendarEntries.find((e) => e.swapPairId === entry.swapPairId && e.id !== entry.id) ?? null;
}

export function monthLabel(year: number, month0: number): string {
  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  return `${THAI_MONTHS[month0]} ${year + 543}`;
}

/** ตัวอักษรย่อ 2 ตัวจากชื่อเล่นพนักงาน สำหรับ avatar */
export function initials(employee: Employee): string {
  return employee.nickname.slice(0, 2).toUpperCase();
}

// ============ เติมวันสำคัญอัตโนมัติ (คำนวณล่วงหน้า ไม่ใช่ query AI จริง) — เฟส 5 ============
// หมายเหตุ: วันหยุดราชการใช้รายการทางการที่ทราบล่วงหน้า (วันที่คงที่ + วันหยุดตามมติ ครม. ที่พบบ่อย)
// ส่วนวันพระคำนวณจากปฏิทินจันทรคติแบบประมาณการ (ข้างขึ้น/ข้างแรม 8 ค่ำ, 15 ค่ำ) — เจ้าของ/ผู้จัดการตรวจสอบและแก้ไขได้เสมอ

/** วันหยุดราชการไทยที่วันที่ตายตัวทุกปี (ไม่รวมวันหยุดชดเชย/วันหยุดพิเศษที่ ครม. ประกาศเพิ่มเป็นปีๆ ไป) */
export function fixedThaiPublicHolidays(year: number): { date: string; label: string }[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = (m: number, day: number) => `${year}-${pad(m)}-${pad(day)}`;
  return [
    { date: d(1, 1), label: 'วันขึ้นปีใหม่' },
    { date: d(4, 6), label: 'วันจักรี' },
    { date: d(4, 13), label: 'วันสงกรานต์' },
    { date: d(4, 14), label: 'วันสงกรานต์' },
    { date: d(4, 15), label: 'วันสงกรานต์' },
    { date: d(5, 1), label: 'วันแรงงานแห่งชาติ' },
    { date: d(5, 4), label: 'วันฉัตรมงคล' },
    { date: d(7, 28), label: 'วันเฉลิมพระชนมพรรษา ร.10' },
    { date: d(8, 12), label: 'วันแม่แห่งชาติ' },
    { date: d(10, 13), label: 'วันคล้ายวันสวรรคต ร.9' },
    { date: d(10, 23), label: 'วันปิยมหาราช' },
    { date: d(12, 5), label: 'วันพ่อแห่งชาติ' },
    { date: d(12, 10), label: 'วันรัฐธรรมนูญ' },
    { date: d(12, 31), label: 'วันสิ้นปี' },
  ];
}

/** วันพระที่ตรวจสอบแล้วจากปฏิทินจันทรคติไทยจริง (ไม่ใช่คำนวณดาราศาสตร์) — เพิ่มปีใหม่ที่นี่เมื่อตรวจสอบแล้ว
 *  ปฏิทินจันทรคติไทยมีปีอธิกมาส (เดือน 8 สองหน) เป็นบางปีซึ่งสูตรคำนวณดาราศาสตร์อย่างเดียวคำนวณผิดได้ทั้งปี
 *  ที่มา: myhora.com/calendar/buddhist-2569.aspx และ thaipbs.or.th/now/content/3498 (ตรงกันทั้ง 2 แหล่ง 7 ก.ย. 2569) */
const VERIFIED_HOLY_DAYS: Record<number, string[]> = {
  2026: [
    '2026-01-03', '2026-01-11', '2026-01-18', '2026-01-26',
    '2026-02-02', '2026-02-10', '2026-02-16', '2026-02-24',
    '2026-03-03', '2026-03-11', '2026-03-18', '2026-03-26',
    '2026-04-02', '2026-04-10', '2026-04-16', '2026-04-24',
    '2026-05-01', '2026-05-09', '2026-05-16', '2026-05-24', '2026-05-31',
    '2026-06-08', '2026-06-14', '2026-06-22', '2026-06-29',
    '2026-07-07', '2026-07-14', '2026-07-22', '2026-07-29', '2026-07-30',
    '2026-08-06', '2026-08-13', '2026-08-21', '2026-08-28',
    '2026-09-05', '2026-09-11', '2026-09-19', '2026-09-26',
    '2026-10-04', '2026-10-11', '2026-10-19', '2026-10-26',
    '2026-11-03', '2026-11-09', '2026-11-17', '2026-11-24',
    '2026-12-02', '2026-12-09', '2026-12-17', '2026-12-24',
  ],
};

/** คำนวณวันพระโดยประมาณ (8 ค่ำ/15 ค่ำ ข้างขึ้น-ข้างแรม) จากรอบจันทรคติ synodic month ~29.530589 วัน
 *  อ้างอิงวันเดือนมืด (new moon) จริงใกล้เคียง 2000-01-06 12:14 UTC เป็นจุดเริ่ม แล้วนับ 8/15/23/30 ของแต่ละรอบ
 *  เป็นการประมาณการทางดาราศาสตร์เท่านั้น — ปฏิทินจันทรคติไทยจริงมีปีอธิกมาส/อธิกวารที่สูตรนี้ไม่รู้จัก
 *  จึงอาจคลาดเคลื่อนได้ทั้งเดือน/ทั้งปี ใช้เฉพาะปีที่ไม่มีใน VERIFIED_HOLY_DAYS ด้านบนเท่านั้น */
function approximateBuddhistHolyDaysAstro(year: number): { date: string; label: string }[] {
  const SYNODIC = 29.530588853;
  const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 12, 14, 0); // ms
  const MS_PER_DAY = 86400000;

  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year, 11, 31, 23, 59, 59);

  const cyclesSinceKnown = (yearStart - KNOWN_NEW_MOON) / (SYNODIC * MS_PER_DAY);
  let cycle = Math.floor(cyclesSinceKnown) - 1;

  const results: { date: string; label: string }[] = [];
  const seen = new Set<string>();

  while (true) {
    const newMoonMs = KNOWN_NEW_MOON + cycle * SYNODIC * MS_PER_DAY;
    if (newMoonMs > yearEnd) break;
    // ขึ้น 8 ค่ำ (~+7 วัน), ขึ้น 15 ค่ำ/เพ็ญ (~+14 วัน), แรม 8 ค่ำ (~+22 วัน), แรม 14/15 ค่ำ (~+29 วัน จนถึงเดือนถัดไป)
    const offsets = [7, 14, 22, 29];
    for (const off of offsets) {
      const ms = newMoonMs + off * MS_PER_DAY;
      if (ms < yearStart || ms > yearEnd) continue;
      const dt = new Date(ms);
      const dateStr = toDateStr(dt);
      if (seen.has(dateStr)) continue;
      seen.add(dateStr);
      results.push({ date: dateStr, label: '' });
    }
    cycle += 1;
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/** ตรวจว่าปีนี้มีข้อมูลวันพระที่ตรวจสอบแล้วจริงหรือไม่ — ใช้เตือนก่อนเติมวันสำคัญอัตโนมัติเพื่อเตือนเจ้าของร้านว่าควรตรวจซ้ำก่อน */
export function isVerifiedHolyDayYear(year: number): boolean {
  return year in VERIFIED_HOLY_DAYS;
}

/** วันพระของปีที่ระบุ — ใช้ข้อมูลที่ตรวจสอบแล้วถ้ามี ไม่งั้น fallback ไปสูตรดาราศาสตร์โดยประมาณ (ดูคำเตือนด้านบน) */
export function approximateBuddhistHolyDays(year: number): { date: string; label: string }[] {
  const verified = VERIFIED_HOLY_DAYS[year];
  if (verified) {
    return verified.map((date) => ({ date, label: '' }));
  }
  return approximateBuddhistHolyDaysAstro(year);
}
