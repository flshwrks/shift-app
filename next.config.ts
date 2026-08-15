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

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: readAppVersion(),
    NEXT_PUBLIC_RELEASE_HISTORY: readReleaseHistory(),
    // 本部の受信箱からGitHub Issueへリンクするために使う。リポジトリ名は機微情報ではない
    NEXT_PUBLIC_FEEDBACK_REPO: process.env.GITHUB_FEEDBACK_REPO || 'flshwrks/shift-app',
  },
};

export default nextConfig;
