import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

// package.json の version をビルド時に読み、NEXT_PUBLIC_APP_VERSION としてクライアントから
// 参照できるようにする。CHANGELOG.md の全エントリも同様にビルド時に読んで埋め込む。
// これらを別ファイルに手で転記すると原本（package.json / CHANGELOG.md）とズレうるが、
// ビルドのたびに原本から直接読むことでズレようがない構成にしている。
function readAppVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "";
  } catch {
    return "";
  }
}

// CHANGELOG.md の全エントリ（`## [x.y.z] - YYYY-MM-DD` 単位）を新しい順に構造化して返す。
// 更新のお知らせ（直近1件）と更新履歴ページ（全件）の両方がこれ1つを使う。
// フォーマットが変わってパースできない場合もビルド自体は壊さず空配列にフォールバックする
// （更新履歴が出ないだけで、アプリ本体の動作には影響させない）。
//
// ★本文の終わりを正規表現の `$` で探さないこと★ `$` はmフラグ付きだと「行末」全てに
// マッチするため、見出し直後の空行で即座に終了して本文が空になる。さらにWindows改行(CRLF)
// では `\r` の直前にもマッチして事故が分かりにくくなる（実際に踏んだ）。
// ここでは読み込み直後にCRLFをLFへ正規化したうえで、本文の範囲は「次の見出しの開始位置」
// から求める。改行コードにも空行にも影響されない。
function readReleaseHistory(): string {
  try {
    const changelog = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
    const headingRe = /^## \[([^\]]+)\]\s*-\s*([^\n]*)$/gm;

    const headings: { version: string; date: string; start: number; end: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(changelog)) !== null) {
      headings.push({
        version: match[1],
        date: match[2].trim(),
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    const entries = headings.map((heading, i) => ({
      version: heading.version,
      date: heading.date,
      // 次の見出しの直前までが本文。最後のエントリはファイル末尾まで
      body: changelog
        .slice(heading.end, i + 1 < headings.length ? headings[i + 1].start : changelog.length)
        // エントリ間の区切り線（`---`）が末尾に紛れ込むので取り除く
        .replace(/\n-{3,}\s*$/, "")
        .trim(),
    }));

    return JSON.stringify(entries);
  } catch {
    return "[]";
  }
}

// HTTPのセキュリティヘッダー。Vercelは既定で付けないため、ここで明示する。
//
// このアプリはPINを入力する画面を持つので、**iframeへの埋め込みを禁じる**のが要点。
// 埋め込みを許すと、悪意あるページが透明にしたログイン画面を重ねて、
// 利用者が別のものを押しているつもりでPINを入れる（クリックジャッキング）余地が残る。
//
// CSPは付けていない。ここに書いたヘッダーは「壊れたら分かる」ものだが、
// CSPは書き方を誤ると画面が黙って壊れる（Google Fontsやインラインスタイルの許可漏れ）。
// XSSの実体（dangerouslySetInnerHTMLの使用）が現状0件で、Reactの標準エスケープに
// 乗っている以上、多層防御としての優先度は他の項目より低いと判断した。
// 入れるなら Report-Only で様子を見てから（docs/SECURITY.md SEC-5）。
const securityHeaders = [
  // iframeへの埋め込みを一切許可しない（PIN入力画面のクリックジャッキング対策）
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // Content-Typeの推測を止める（配信ファイルを別の型として実行させない）
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 外部サイトへ遷移するときにURLのパスを渡さない。
  // 店舗IDは推測不能化で守っている値なので、Refererから漏らさない（F-6と対）
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 使っていないブラウザ機能を明示的に閉じる
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: readAppVersion(),
    NEXT_PUBLIC_RELEASE_HISTORY: readReleaseHistory(),
    // 本部の受信箱からGitHub Issueへリンクするために使う。リポジトリ名は機微情報ではない。
    // 要望の置き場所は**非公開**リポジトリ（app/api/feedback/route.ts の注記を参照）
    NEXT_PUBLIC_FEEDBACK_REPO: process.env.GITHUB_FEEDBACK_REPO || 'flshwrks/shift-app-feedback',
  },
};

export default nextConfig;
