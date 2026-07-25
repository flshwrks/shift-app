// PostToolUse hook: ソースファイルが編集されたら SPEC.md を自動更新する
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SPEC_PATH = path.join(PROJECT_ROOT, 'docs', 'SPEC.md');
const LOCK_PATH = path.join(PROJECT_ROOT, '.spec-update-lock');
const DEBOUNCE_MS = 3 * 60 * 1000; // 3分

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  try {
    const { tool_input } = JSON.parse(raw);
    const filePath = tool_input?.file_path ?? '';

    // 対象外のファイルはスキップ
    const isSourceFile =
      /\.(tsx?|ts)$/.test(filePath) &&
      !filePath.includes('SPEC.md') &&
      !filePath.includes('update-spec') &&
      !filePath.includes('node_modules') &&
      !filePath.includes('.next');
    if (!isSourceFile) return;

    // デバウンス: 直近3分以内に更新済みならスキップ
    if (fs.existsSync(SPEC_PATH)) {
      const lastMod = fs.statSync(SPEC_PATH).mtimeMs;
      if (Date.now() - lastMod < DEBOUNCE_MS) return;
    }

    // ロックファイルで二重実行を防ぐ
    if (fs.existsSync(LOCK_PATH)) return;
    fs.writeFileSync(LOCK_PATH, String(Date.now()));

    const today = new Date().toISOString().split('T')[0];
    const prompt =
      `このシフト管理アプリのソースコードを読んで、docs/SPEC.md を現在の実装に合わせて更新してください。\n` +
      `手順:\n` +
      `1. app/, components/, lib/ 内の全ファイルを Read で確認する\n` +
      `2.「画面一覧・実装済み機能」セクションの [x] / [ ] チェックリストを正確に更新する\n` +
      `3.「最終更新」日付を ${today} に更新する\n` +
      `4. データモデル・技術スタック・未実装セクションはコードが変わった場合のみ更新する\n` +
      `5. docs/SPEC.md を Write で上書き保存する`;

    spawnSync('claude', ['-p', prompt, '--allowedTools', 'Read,Write'], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 120_000,
      shell: true,
    });
  } catch {
    // サイレントフェイル — 開発フローを止めない
  } finally {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  }
});
