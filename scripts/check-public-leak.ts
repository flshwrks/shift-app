/**
 * 公開リポジトリに置いてはいけないものが混ざっていないかを検査する。
 *
 *   npm run check:leak
 *
 * ★なぜ要るか★
 * このリポジトリは**公開**されている（会社に中身を見せられることが説明材料になる）。
 * 一方で、スタッフに配る文面・本番URL・実名といった「外に出してはいけないもの」は、
 * 見た目がただのテキストなので、開発資料と同じ `docs/` に置いても違和感がない。
 *
 * 2026-08-17、実際に `docs/staff-line-note.txt`（LINEで配る使い方の文面）が
 * 公開リポジトリに入り、**本番URL・店舗ID・実名が約1か月のあいだ公開されていた**。
 * そのURLを開けばログイン不要でスタッフ9名の氏名と勤務予定が見られる状態だった。
 *
 * ルールを文章で書くだけでは同じことが起きる（今回もそうだった）。
 * **CIで落として、コミットできないようにする。**
 *
 * ★検査対象は git 管理下のファイルだけ★
 * `資料/` のような管理外の置き場は対象にしない。そこは「外に出さない」場所なので、
 * 実名や本番URLがあってよい。問題なのは**公開される場所に入ること**。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface Rule {
  name: string;
  /** 見つけたら不合格にする */
  pattern: RegExp;
  why: string;
  /** このファイルでは許す（説明のために引用している箇所） */
  allow?: RegExp;
  /** 指定したときは、このパターンに一致するファイルだけを検査する */
  only?: RegExp;
}

const RULES: Rule[] = [
  {
    name: '本番URL',
    // 実際のデプロイ先のホスト名。プレビューURLも同じ形なので host ごと禁じる
    pattern: /https?:\/\/[a-z0-9-]+\.vercel\.app/gi,
    why: 'ドメインが分かると、あとは店舗IDを推測するだけで公開シフト表に到達できる。'
      + '配布用のURLは 資料/ に置くこと（git管理外）',
    // この検査スクリプト自身と、経緯を記録した文書は説明のために書いてよい
    allow: /^(scripts\/check-public-leak\.ts|docs\/SECURITY\.md|improvement_list\/)/,
  },
  {
    name: '具体的な店舗IDを含むパス',
    // /s/[storeSlug]/ のようなプレースホルダは正当。実際の値が入っているものだけを弾く。
    //
    // ★文章ファイルだけを見る★
    // 配布用の文面が入り込むのは .md / .txt。コードやテストの中の
    // `/s/main/staff` のような値は**架空の入力データ**であって、
    // それ単体では誰もアクセスできない（ホスト名が無い）。
    // そこまで弾くと、テストを書くたびに引っかかって検査が無視されるようになる。
    pattern: /\/s\/(?!\[)[a-z0-9][a-z0-9-]{1,38}\/(login|public|staff|admin)/g,
    why: '店舗IDが漏れると、公開シフト表からスタッフの氏名と勤務予定が見える（F-6）。'
      + 'ドキュメントでは /s/[storeSlug]/... と書くこと',
    only: /\.(md|txt)$/i,
    allow: /^(docs\/SECURITY\.md|improvement_list\/)/,
  },
];

/** 検査しないもの（バイナリ・ロックファイル・依存） */
const SKIP = /^(node_modules\/|\.next\/|public\/|package-lock\.json$|.*\.(png|jpg|jpeg|gif|webp|ico|pdf|docx|xlsx|woff2?)$)/i;

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return out.split('\n').map(l => l.trim()).filter(l => l && !SKIP.test(l));
}

function main(): void {
  const problems: string[] = [];

  for (const file of trackedFiles()) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // 読めないもの（バイナリ等）は対象外
    }

    for (const rule of RULES) {
      if (rule.only && !rule.only.test(file)) continue;
      if (rule.allow?.test(file)) continue;
      // グローバル正規表現は lastIndex を持ち回るので、毎回作り直す
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const m = re.exec(line);
        if (m) problems.push(`${file}:${i + 1}  [${rule.name}] ${m[0]}\n    → ${rule.why}`);
        re.lastIndex = 0;
      });
    }
  }

  if (problems.length === 0) {
    console.log('OK: 公開してはいけないものは見つかりませんでした。');
    return;
  }

  console.error('✖ 公開リポジトリに置けないものが見つかりました。\n');
  for (const p of problems) console.error(p + '\n');
  console.error(
    `${problems.length}件。配布用の文面・本番URL・実名は 資料/ 配下（git管理外）に置いてください。\n` +
    '経緯: docs/SECURITY.md「公開リポジトリへの流出（2026-09-11）」',
  );
  process.exit(1);
}

main();
