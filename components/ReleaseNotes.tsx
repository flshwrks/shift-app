// CHANGELOG.md 由来の更新履歴を扱う共通部品。
// データは next.config.ts がビルド時に CHANGELOG.md から作った JSON（NEXT_PUBLIC_RELEASE_HISTORY）。
// 更新のお知らせ（UpdateToast）と更新履歴ページ（/release-notes）の両方から使う。
// フックを使わない純粋な関数・コンポーネントなので、サーバー・クライアントどちらからでも呼べる。

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

// CHANGELOG.mdの1エントリ分（見出し・箇条書き・**太字**程度）を、外部ライブラリなしで
// 素直に整形するだけの簡易パーサー。凝った構文（表・リンク・ネストしたリスト）は扱わない。
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

export function ReleaseNotesBody({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: { text: string; indent: boolean }[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="space-y-1 mb-3">
        {items.map((item, i) => (
          <li key={i} className={`text-sm text-slate-600 flex gap-1.5 ${item.indent ? 'pl-4' : ''}`}>
            <span className="text-slate-300 flex-shrink-0">•</span>
            <span>{renderInline(item.text)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const heading = line.match(/^###\s+(.*)/);
    const bullet = line.match(/^(\s*)-\s+(.*)/);

    if (heading) {
      flushList();
      blocks.push(
        <h4 key={`h-${i}`} className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 mt-3 first:mt-0">
          {heading[1]}
        </h4>
      );
    } else if (bullet) {
      listItems.push({ text: bullet[2], indent: bullet[1].length > 0 });
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={`p-${i}`} className="text-sm text-slate-600 mb-2">{renderInline(line.trim())}</p>);
    }
  });
  flushList();

  return <>{blocks}</>;
}
