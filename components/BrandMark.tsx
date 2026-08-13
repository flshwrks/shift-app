import { IconCalendar } from '@/components/icons';

// ブランドマークは「角丸の色付きボックス＋線画アイコン」で統一する
// （docs/DESIGN_SYSTEM.md §5）。シフト管理アプリはカレンダー、在庫管理アプリは箱。
// 角丸は在庫管理アプリと同じ3〜5pxに揃える。大きい角丸は画面全体を柔らかく見せるが、
// 業務画面では「作り物っぽさ」として出るため両アプリで抑えている。
const SIZE_MAP = {
  sm: { box: 'w-6 h-6 rounded-[3px]', icon: 'w-3.5 h-3.5' },
  md: { box: 'w-10 h-10 rounded-[4px]', icon: 'w-5 h-5' },
  lg: { box: 'w-12 h-12 rounded-[5px]', icon: 'w-6 h-6' },
} as const;

export default function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { box, icon } = SIZE_MAP[size];
  return (
    <span className={`${box} bg-blue-600 text-white flex items-center justify-center flex-shrink-0`}>
      <IconCalendar className={icon} strokeWidth={2} />
    </span>
  );
}
