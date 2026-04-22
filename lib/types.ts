export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export type ShiftType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'custom';
export type ShiftStatus = 'draft' | 'confirmed';

export interface Shift {
  id: string;
  user_id: string;
  date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  comment: string;
  status: ShiftStatus;
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
}

export const SHIFT_PRESETS: Record<Exclude<ShiftType, 'custom'>, { start: string; end: string; label: string }> = {
  A: { start: '08:00', end: '13:00', label: 'A  8:00〜13:00' },
  B: { start: '09:00', end: '14:00', label: 'B  9:00〜14:00' },
  C: { start: '08:00', end: '17:00', label: 'C  8:00〜17:00' },
  D: { start: '09:00', end: '18:00', label: 'D  9:00〜18:00' },
  E: { start: '13:00', end: '22:00', label: 'E 13:00〜22:00' },
  F: { start: '17:00', end: '22:00', label: 'F 17:00〜22:00' },
};

export const SHIFT_COLORS: Record<ShiftType, string> = {
  A: '#3B82F6',
  B: '#10B981',
  C: '#8B5CF6',
  D: '#F59E0B',
  E: '#EF4444',
  F: '#EC4899',
  custom: '#6B7280',
};

export const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土'];
