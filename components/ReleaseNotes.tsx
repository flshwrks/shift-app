// CHANGELOG.md 由来の更新履歴を扱う共通部品。
// データは next.config.ts がビルド時に CHANGELOG.md から作った JSON（NEXT_PUBLIC_RELEASE_HISTORY）。
// フックを使わない純粋な関数・コンポーネントなので、サーバー・クライアントどちらからでも呼べる。
//
// ★読み手はスタッフ（アルバイトを含む）である★
// CHANGELOG.md は開発者向けの記録も兼ねているため、そのまま出すとファイル名や
// 技術用語が並んで読む気を削ぐ。ここで「スタッフが読んで意味のある部分」だけに絞る。
// 絞り込みのルールは2つだけにして、CHANGELOG.md 側の書き方の約束と対応させている
// （約束は CLAUDE.md に明記）:
//   1. インデントされた入れ子の箇条書き = 技術的な補足 → 出さない
//   2. バッククォートで囲んだ部分 = ファイル名・識別子など → 消す
// この2つで足りるように CHANGELOG.md を書くこと。

export interface ReleaseEntry {
  version: string;
  date: string;
  body: string;
}

/** ビルド時に埋め込まれた更新履歴を新しい順で返す。壊れていれば空配列（画面は「履歴なし」を出す） */
export function getReleaseHistory(): ReleaseEntry[] {
  try {
    const parsed = JSON.parse(process.env.NEXT_PUBLIC_RELEASE_HISTORY ?? '[]');
    return Array.isArray(parsed) ? (parsed as ReleaseEntry[]) : [];
  } catch {
    return [];
  }
}

/** バッククォート内（ファイル名・クラス名・テーブル名など）を落とし、残った空括弧や余分な空白を整える */
function stripTechnical(text: string): string {
  return text
    .replace(/`[^`]*`/g, '')
    .replace(/（\s*）/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([、。）])/g, '$1')
    .trim();
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string };

/** CHANGELOGの1エントリを、スタッフ向けに絞り込んだブロック列へ変換する */
export function toStaffBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') continue;

    // 「詳細は〜を参照」のような、開発者向けの参照先だけの行は出さない
    if (/^詳細|詳細は.*参照/.test(line.trim())) continue;

    const heading = line.match(/^###\s+(.*)/);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1].trim() });
      continue;
    }

    const bullet = line.match(/^(\s*)-\s+(.*)/);
    if (bullet) {
      // インデントされた入れ子の箇条書きは技術的な補足なので出さない
      if (bullet[1].length > 0) continue;
      const text = stripTechnical(bullet[2]);
      if (text) blocks.push({ kind: 'bullet', text });
      continue;
    }

    const text = stripTechnical(line.trim());
    if (text) blocks.push({ kind: 'paragraph', text });
  }

  return blocks;
}

// **強調** だけ拾う簡易インライン整形
function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

// 見出しは「追加 / 変更 / 修正」の3種が基本。色で種類が一目で分かるようにする
const HEADING_STYLE: Record<string, string> = {
  追加: 'bg-blue-50 text-blue-700 border-blue-200',
  変更: 'bg-amber-50 text-amber-700 border-amber-200',
  修正: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const DEFAULT_HEADING_STYLE = 'bg-slate-100 text-slate-600 border-slate-200';

function headingStyle(text: string): string {
  const key = Object.keys(HEADING_STYLE).find(k => text.startsWith(k));
  return key ? HEADING_STYLE[key] : DEFAULT_HEADING_STYLE;
}

export function ReleaseNotesBody({ markdown }: { markdown: string }) {
  const blocks = toStaffBlocks(markdown);

  if (blocks.length === 0) {
    return <p className="text-sm text-slate-400">この版の変更点はありません。</p>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <div key={i} className="pt-1 first:pt-0">
              <span className={`text-[11px] px-2 py-0.5 rounded font-semibold border ${headingStyle(block.text)}`}>
                {block.text}
              </span>
            </div>
          );
        }
        if (block.kind === 'bullet') {
          return (
            <div key={i} className="flex gap-2.5 pl-0.5">
              <span className="text-slate-300 flex-shrink-0 leading-relaxed">•</span>
              <p className="text-sm text-slate-600 leading-relaxed">{renderInline(block.text)}</p>
            </div>
          );
        }
        return (
          <p key={i} className="text-sm text-slate-600 leading-relaxed">{renderInline(block.text)}</p>
        );
      })}
    </div>
  );
}
