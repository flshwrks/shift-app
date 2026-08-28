import { DAY_NAMES_JA } from './types';

export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 8; hour <= 22; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    if (hour < 22) slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  return slots;
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatYM(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** その月の最終日を YYYY-MM-DD で返す（月によって28〜31日が変わる） */
export function monthEnd(year: number, month: number): string {
  // 翌月0日 = その月の末日
  const d = new Date(year, month + 1, 0);
  return formatDate(d);
}

/** その月の初日を YYYY-MM-DD で返す */
export function monthStart(year: number, month: number): string {
  return `${formatYM(year, month)}-01`;
}

/**
 * 月タブ用に、今月を基準とした連続する月を返す。
 * `monthsBack` ヶ月前から始めて `count` ヶ月分。人件費予測とKOT連携で共有している
 * （同じ関数を各画面に持つと、片方だけ直して並びがずれる）。
 */
export function buildMonthTabs(monthsBack: number, count = 7): { year: number; month: number }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
}

export function getDayLabel(date: Date): string {
  const day = date.getDate();
  const dow = DAY_NAMES_JA[date.getDay()];
  return `${day}日(${dow})`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

export function netWorkMinutes(startTime: string, endTime: string): number {
  const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (duration <= 0) return 0;
  if (duration > 8 * 60) return duration - 60;
  if (duration > 6 * 60) return duration - 45;
  return duration;
}

export function formatTotalHours(minutes: number): string {
  if (minutes === 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}
