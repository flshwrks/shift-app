/**
 * lib/help/content.ts（HELP_CONTENT）から docs/GUIDE.md の
 * 「3. スタッフ向け機能」〜「5. 本部管理者向け機能」を生成する。
 *
 * 実行方法:
 *   npm run gen:guide    … 生成して docs/GUIDE.md に書き込む
 *   npm run check:guide  … 書き込まず、現在の docs/GUIDE.md と比較して差分があれば非ゼロ終了（CI用）
 *
 * docs/GUIDE.md 内の <!-- BEGIN:GENERATED --> 〜 <!-- END:GENERATED --> の内側だけが
 * 生成・比較の対象。マーカーの外側（全体構成・ログイン方法・共通ルール等の手書き部分）は
 * このスクリプトが一切変更しない。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { HELP_CONTENT, type Section } from '../lib/help/content';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDE_PATH = path.resolve(__dirname, '../docs/GUIDE.md');
const BEGIN_MARKER = '<!-- BEGIN:GENERATED -->';
const END_MARKER = '<!-- END:GENERATED -->';

function renderSection(section: Section): string {
  const heading = section.href
    ? `### ${section.title}（\`${section.href}\`）`
    : `### ${section.title}`;

  const lines: string[] = [heading, '', `${section.subtitle}。`, ''];

  section.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.text}`);
    if (step.note) lines.push(`   - ${step.note}`);
  });

  if (section.tips && section.tips.length > 0) {
    lines.push('', '**ヒント**');
    for (const tip of section.tips) lines.push(`- ${tip}`);
  }

  return lines.join('\n');
}

function renderRole(sections: Section[]): string {
  return sections.map(renderSection).join('\n\n');
}

function generateBody(): string {
  return [
    '## 3. スタッフ向け機能',
    '',
    renderRole(HELP_CONTENT.staff),
    '',
    '---',
    '',
    '## 4. 店舗管理者向け機能',
    '',
    '店舗管理者は上記のスタッフ向け機能に加えて、以下の管理画面を使える。',
    '',
    renderRole(HELP_CONTENT.admin),
    '',
    '---',
    '',
    '## 5. 本部管理者向け機能',
    '',
    '本部管理者はどの店舗にも属さず、全店舗を横断的に扱える。',
    '',
    renderRole(HELP_CONTENT.hq_admin),
  ].join('\n');
}

function main() {
  const checkMode = process.argv.includes('--check');
  const current = readFileSync(GUIDE_PATH, 'utf8');

  const countOccurrences = (needle: string) => current.split(needle).length - 1;
  if (countOccurrences(BEGIN_MARKER) !== 1 || countOccurrences(END_MARKER) !== 1) {
    console.error(
      `docs/GUIDE.md 内の ${BEGIN_MARKER} / ${END_MARKER} はそれぞれちょうど1回だけ出現する必要があります` +
        '（本文中に説明目的でマーカー文字列を書かないこと。誤って生成範囲を破壊します）。'
    );
    process.exit(1);
  }

  const beginIdx = current.indexOf(BEGIN_MARKER);
  const endIdx = current.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    console.error(
      `docs/GUIDE.md に ${BEGIN_MARKER} / ${END_MARKER} のマーカーが見つかりません。マーカーを手動で追加してから再実行してください。`
    );
    process.exit(1);
  }

  const before = current.slice(0, beginIdx + BEGIN_MARKER.length);
  const after = current.slice(endIdx);
  const generatedBody = generateBody();
  const next = `${before}\n${generatedBody}\n${after}`;

  if (checkMode) {
    if (next !== current) {
      console.error(
        'docs/GUIDE.md が lib/help/content.ts の内容と一致していません。`npm run gen:guide` を実行して再生成してください。'
      );
      const currentGenerated = current.slice(beginIdx + BEGIN_MARKER.length, endIdx).trim();
      console.error('\n--- 現在の docs/GUIDE.md（生成領域） ---');
      console.error(currentGenerated);
      console.error('\n--- lib/help/content.ts から生成される内容 ---');
      console.error(generatedBody.trim());
      process.exit(1);
    }
    console.log('OK: docs/GUIDE.md は lib/help/content.ts と一致しています。');
    return;
  }

  writeFileSync(GUIDE_PATH, next, 'utf8');
  console.log('docs/GUIDE.md を再生成しました。');
}

main();
