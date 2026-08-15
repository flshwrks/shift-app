import { IconInbox, IconClipboard, IconCheck } from '@/components/icons';

// 一覧が空のときの表示。以前は各画面が絵文字（📭 📋 ✅）を直接置いていたが、
// アプリの他の場所は線画アイコンで統一されており、ここだけ浮いていた。
// 1箇所にまとめて、画面ごとに種類だけ選ぶ形にする。
const ICONS = {
  inbox: IconInbox,
  clipboard: IconClipboard,
  check: IconCheck,
} as const;

export default function EmptyState({
  icon,
  message,
  children,
}: {
  icon: keyof typeof ICONS;
  message: string;
  children?: React.ReactNode;
}) {
  const Icon = ICONS[icon];
  return (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm text-slate-400">{message}</p>
      {children}
    </div>
  );
}
