import Image from 'next/image';
import { IconChevronRight } from '@/components/icons';

// 詳しい使い方ページの表示部品。
//
// 見た目のルールはこの2つだけに固定してある（本文の冒頭で読者に凡例を出す）:
//   青＋下線     … このページで押せるもの（<a> のみ）
//   灰の枠つき   … アプリの中にあるものの名前（押すのはアプリ側） = <Ui>
// アプリ側で青は「主ボタン・選択中タブ・リンク・フォーカスリング」に予約されているため、
// 押せない語に青を使わない（docs/DESIGN_SYSTEM.md §2.4）。
//
// 注意書きは色ではなく形で3段階に分ける（同 §2.5「色だけで状態を伝えない」）:
//   Sub      … 枠なし。補足
//   Caution  … 行頭の罫＋「注意」の文字。間違えると手戻りする
//   Critical … 地色つき。押し忘れると仕事が消える・外に出る。1ページに2〜3件だけ

/** アプリの中にある名前（ボタン・タブ・画面名）。押せそうに見せないため青にしない */
export function Ui({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-slate-100 border border-slate-200 rounded-[3px] px-1.5 py-px mx-px text-[0.94em] font-bold text-slate-800 align-baseline">
      {children}
    </span>
  );
}

/** 「ナビ ＞ 設定 ＞ 管理メニュー」のような場所の道順 */
export function NavPath({ steps }: { steps: string[] }) {
  return (
    <p className="mt-2 flex items-center flex-wrap gap-1 text-[13px] text-slate-500">
      <span className="mr-0.5">場所</span>
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-400" aria-hidden="true">›</span>}
          <Ui>{s}</Ui>
        </span>
      ))}
    </p>
  );
}

export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex-shrink-0 w-6 text-right text-[15px] font-bold text-slate-500 tabular-nums">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">{t}</span>
        </li>
      ))}
    </ol>
  );
}

export function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="flex-shrink-0 text-slate-400 select-none" aria-hidden="true">・</span>
          <span className="min-w-0 flex-1">{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** 補足。枠を持たせない */
export function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-slate-300 pl-3.5 text-[15px] leading-[1.85] text-slate-600">
      {children}
    </p>
  );
}

/** 注意。間違えると手戻りする */
export function Caution({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-stretch bg-white border-y border-slate-200 -mx-4 sm:mx-0 sm:border sm:rounded-[4px]">
      <span className="w-[3px] self-stretch bg-red-600 flex-shrink-0" aria-hidden="true" />
      <div className="px-3.5 py-3 min-w-0">
        <span className="text-[12px] font-bold text-red-700 tracking-wide">注意</span>
        <p className="mt-1 text-[15px] leading-[1.85] text-slate-700">{children}</p>
      </div>
    </div>
  );
}

/** 重要。押し忘れると仕事が消える・外に出る。1ページに2〜3件だけ */
export function Critical({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-stretch bg-red-50 border-y border-red-200 -mx-4 sm:mx-0 sm:border sm:rounded-[4px]">
      <span className="w-[3px] self-stretch bg-red-600 flex-shrink-0" aria-hidden="true" />
      <div className="px-3.5 py-3 min-w-0">
        <span className="text-[12px] font-bold text-red-700 tracking-wide">重要</span>
        <p className="mt-1 text-[15px] leading-[1.85] text-slate-800">{children}</p>
      </div>
    </div>
  );
}

/**
 * 画面写真。
 * キャプションを画像より前に置く（DOM順・表示順とも）。写真は縦に長く、
 * 説明が後ろにあると「何を見ればいいか分からないまま眺める」ことになるため。
 */
export function Shot({ n, src, alt, caption, w, h }: {
  n: number; src: string; alt: string; caption: string; w: number; h: number;
}) {
  return (
    <figure className="my-5 sm:flex sm:gap-4 sm:items-start">
      <figcaption className="text-[14px] leading-relaxed text-slate-600 mb-2 sm:mb-0 sm:order-2 sm:flex-1 sm:min-w-0">
        <span className="font-bold text-slate-900 tabular-nums mr-1.5">図{n}</span>
        {caption}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="guide-no-print ml-2 text-[13px] text-blue-700 font-bold underline underline-offset-2"
        >
          拡大
        </a>
      </figcaption>
      <div className="sm:order-1 sm:flex-shrink-0 border border-slate-300 rounded-[4px] overflow-hidden bg-slate-50 max-w-full sm:max-w-[380px]">
        <Image
          src={src}
          alt={alt}
          width={w}
          height={h}
          sizes="(max-width: 639px) 92vw, 380px"
          className="block w-full h-auto"
        />
      </div>
    </figure>
  );
}

export interface FaqItem { id: string; q: string; a: React.ReactNode }

export function Faq({ items, next }: { items: FaqItem[]; next: React.ReactNode }) {
  return (
    <>
      <div className="-mx-4 sm:mx-0 border-y border-slate-300 sm:border sm:rounded-[4px] bg-white">
        {items.map(({ id, q, a }) => (
          <details
            key={id}
            id={id}
            className="group border-b border-slate-200 last:border-b-0 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="list-none cursor-pointer min-h-[52px] px-4 py-3.5 text-[15px] font-bold text-slate-900 hover:bg-slate-50 flex items-center justify-between gap-3">
              <span className="min-w-0">{q}</span>
              <IconChevronRight
                className="w-4 h-4 text-slate-500 flex-shrink-0 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
            </summary>
            <div className="px-4 pb-4 text-[15px] leading-[1.9] text-slate-700 space-y-2">{a}</div>
          </details>
        ))}
      </div>
      <p className="text-[15px] leading-[1.9] text-slate-700">{next}</p>
    </>
  );
}

/* ---------- 早見表 ---------- */

export type RoleId = 'staff' | 'admin' | 'hq';

/** 3役割で共通の事実。1か所に持ち、各ページは自分の列を強調して出す */
const CAN_DO: { label: string; staff: boolean; admin: boolean; hq: boolean }[] = [
  { label: 'シフトを希望する',           staff: true,  admin: true,  hq: false },
  { label: 'シフト表を見る',             staff: true,  admin: true,  hq: true  },
  { label: 'シフトを確定する',           staff: false, admin: true,  hq: true  },
  { label: '調整依頼に答える',           staff: true,  admin: true,  hq: false },
  { label: '調整依頼を出す・取り消す',   staff: false, admin: true,  hq: true  },
  { label: 'スタッフを追加・編集・削除', staff: false, admin: true,  hq: true  },
  { label: '提出期間を決める',           staff: false, admin: true,  hq: true  },
  { label: 'シフト種別を設定する',       staff: false, admin: true,  hq: true  },
  { label: '人件費予測を見る',           staff: false, admin: true,  hq: true  },
  { label: 'アンケートを取る',           staff: false, admin: true,  hq: true  },
  { label: '操作の記録を見る',           staff: false, admin: true,  hq: true  },
  { label: '要望を送る',                 staff: true,  admin: false, hq: false },
  { label: '店舗を追加・編集・削除',     staff: false, admin: false, hq: true  },
  { label: 'エラーの記録を見る',         staff: false, admin: false, hq: true  },
  { label: '本部管理者を追加・削除',     staff: false, admin: false, hq: true  },
];

const ROLE_LABEL: Record<RoleId, string> = {
  staff: 'スタッフ', admin: '店舗管理者', hq: '本部管理者',
};

function Mark({ on }: { on: boolean }) {
  return on
    ? <span className="text-slate-900 font-bold" aria-label="できる">○</span>
    : <span className="text-slate-500" aria-label="できない">×</span>;
}

export function PermissionTable({ me }: { me?: RoleId }) {
  const cols: RoleId[] = ['staff', 'admin', 'hq'];
  return (
    <>
      {/* スマホ: 横スクロールする表は突き合わせて読めないので、1行1項目にする */}
      <ul className="sm:hidden -mx-4 border-y border-slate-300 bg-white">
        {CAN_DO.map(row => (
          <li key={row.label} className="px-4 py-2.5 border-b border-slate-200 last:border-b-0">
            <p className="text-[15px] text-slate-900">{row.label}</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              {cols.map(c => (
                <span key={c} className={c === me ? 'font-bold text-slate-900' : 'text-slate-500'}>
                  {ROLE_LABEL[c]} <Mark on={row[c]} />
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block border border-slate-300 rounded-[4px] bg-white overflow-hidden">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="text-[13px] text-slate-600 border-b border-slate-300 bg-slate-50">
              <th className="text-left font-medium px-3 py-2">できること</th>
              {cols.map(c => (
                <th key={c} className={`font-medium px-2 py-2 w-24 ${c === me ? 'text-slate-900 bg-blue-50' : ''}`}>
                  {ROLE_LABEL[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {CAN_DO.map(row => (
              <tr key={row.label}>
                <td className="px-3 py-1.5 text-slate-700">{row.label}</td>
                {cols.map(c => (
                  <td key={c} className={`px-2 py-1.5 text-center ${c === me ? 'bg-blue-50' : ''}`}>
                    <Mark on={row[c]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 休憩の自動控除。判定はシフトの長さ（終了−開始）で行う（lib/shifts.ts の netWorkMinutes） */
export function BreakTable() {
  const rows: [string, string][] = [
    ['8時間を超える', '− 60分'],
    ['6時間を超えて8時間以下', '− 45分'],
    ['6時間以下', '控除なし'],
  ];
  return (
    <div className="-mx-4 sm:mx-0 border-y border-slate-300 sm:border sm:rounded-[4px] bg-white overflow-hidden">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="text-[13px] text-slate-600 border-b border-slate-300 bg-slate-50">
            <th className="text-left font-medium px-4 py-2">シフトの長さ（終了 − 開始）</th>
            <th className="text-right font-medium px-4 py-2 w-28">引かれる休憩</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td className="px-4 py-2 text-slate-700">{a}</td>
              <td className="px-4 py-2 text-right text-slate-700 tabular-nums whitespace-nowrap">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
