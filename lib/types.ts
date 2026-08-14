export type UserRole = 'hq_admin' | 'admin' | 'staff' | 'developer';

export interface Store {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  created_at: string;
  display_order?: number;
  store_id?: string | null;
}

export type ShiftType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'custom' | 'off';
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
  store_id?: string | null;
}

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
  storeId: string | null; // hq_admin/developer は null
  storeSlug: string | null; // 同上
}

/** 管理画面（店舗の管理者エリア）にアクセスできるか */
export function canAccessAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'hq_admin' || role === 'developer';
}

/** 全店舗を横断できる本部権限か */
export function isHqRole(role: UserRole): boolean {
  return role === 'hq_admin' || role === 'developer';
}

export const SHIFT_PRESETS: Record<Exclude<ShiftType, 'custom' | 'off'>, { start: string; end: string; label: string }> = {
  A: { start: '08:00', end: '13:00', label: 'A  8:00〜13:00' },
  B: { start: '09:00', end: '14:00', label: 'B  9:00〜14:00' },
  C: { start: '08:00', end: '17:00', label: 'C  8:00〜17:00' },
  D: { start: '09:00', end: '18:00', label: 'D  9:00〜18:00' },
  E: { start: '13:00', end: '22:00', label: 'E 13:00〜22:00' },
  F: { start: '17:00', end: '22:00', label: 'F 17:00〜22:00' },
  G: { start: '09:00', end: '22:00', label: 'G  9:00〜22:00' },
};

export const SHIFT_COLORS: Record<ShiftType, string> = {
  A: '#3B82F6',
  B: '#10B981',
  C: '#8B5CF6',
  D: '#F59E0B',
  E: '#EF4444',
  F: '#EC4899',
  G: '#0EA5E9',
  custom: '#6B7280',
  off: '#94A3B8',
};

export const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土'];

export type RequestType = 'targeted' | 'open';
export type RequestStatus = 'open' | 'fulfilled' | 'cancelled';
export type TargetStatus = 'pending' | 'accepted' | 'declined';

export interface ShiftRequest {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_type: Exclude<ShiftType, 'off'> | null;
  message: string;
  request_type: RequestType;
  created_by: string | null;
  status: RequestStatus;
  created_at: string;
  creator?: User;
  targets?: ShiftRequestTarget[];
}

export interface ShiftRequestTarget {
  id: string;
  request_id: string;
  user_id: string;
  status: TargetStatus;
  responded_at: string | null;
  user?: User;
}

export type FeedbackDestination = 'store' | 'dev';
export type FeedbackCategory = 'request' | 'bug';
export type FeedbackStatus = 'new' | 'read' | 'done';

export interface Feedback {
  id: string;
  store_id: string | null;
  user_id: string;
  destination: FeedbackDestination;
  category: FeedbackCategory;
  body: string;
  status: FeedbackStatus;
  app_version: string;
  github_issue_number: number | null;
  created_at: string;
  user?: User;
}
