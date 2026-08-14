import { NextResponse } from 'next/server';
import { getSession, requireAdmin } from '@/lib/session';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { isHqRole } from '@/lib/types';
import type { FeedbackCategory, FeedbackDestination, FeedbackStatus } from '@/lib/types';

const DESTINATIONS: FeedbackDestination[] = ['store', 'dev'];
const CATEGORIES: FeedbackCategory[] = ['request', 'bug'];
const STATUSES: FeedbackStatus[] = ['new', 'read', 'done'];

// 型述語にしておくことで、バリデーションを通った後の値が絞り込まれた型になる。
// 単なる includes() だと string のままで、後続の関数呼び出しに渡せない
const isDestination = (v: string): v is FeedbackDestination => DESTINATIONS.includes(v as FeedbackDestination);
const isCategory = (v: string): v is FeedbackCategory => CATEGORIES.includes(v as FeedbackCategory);
const isStatus = (v: string): v is FeedbackStatus => STATUSES.includes(v as FeedbackStatus);

const BODY_MIN = 1;
const BODY_MAX = 2000;
const BODY_ERROR = `内容は${BODY_MIN}〜${BODY_MAX}文字で入力してください`;

// 同一ユーザーからの連投（誤連打・荒らし）を抑止するレート制限
const RATE_LIMIT_WINDOW_HOURS = 24;
const RATE_LIMIT_MAX = 10;

// リポジトリ名は環境変数で上書き可能にし、既定値をこのリポジトリにする
const GITHUB_REPO = process.env.GITHUB_FEEDBACK_REPO || 'flshwrks/shift-app';

function parseFeedbackPayload(body: unknown) {
  const b = body as Record<string, unknown> | null;
  return {
    destination: typeof b?.destination === 'string' ? b.destination : '',
    category: typeof b?.category === 'string' ? b.category : '',
    body: typeof b?.body === 'string' ? b.body.trim() : '',
    appVersion: typeof b?.appVersion === 'string' ? b.appVersion : '',
    userAgent: typeof b?.userAgent === 'string' ? b.userAgent : '',
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'ログインが必要です' }, { status: 403 });

  const { destination, category, body, appVersion, userAgent } = parseFeedbackPayload(
    await request.json().catch(() => null),
  );

  if (!isDestination(destination)) {
    return NextResponse.json({ error: '送信先を選択してください' }, { status: 400 });
  }
  if (!isCategory(category)) {
    return NextResponse.json({ error: '種別を選択してください' }, { status: 400 });
  }
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return NextResponse.json({ error: BODY_ERROR }, { status: 400 });
  }

  // 要望を送れるのはスタッフだけ。管理者・本部管理者は「受け取って対応する側」であり、
  // 自分宛てにも開発者宛てにも送れないようにしている（UI側でも導線を出していないが、
  // APIを直接叩かれた場合に備えてサーバー側でも検証する）
  if (session.role !== 'staff') {
    return NextResponse.json({ error: '要望を送れるのはスタッフのみです' }, { status: 403 });
  }

  // スタッフは必ず店舗に属するのでここには到達しない想定だが、万一 storeId が無い場合に
  // DB側の feedback_store_id_required 制約で生のPostgresエラー文が画面に出るのを防ぐ
  if (destination === 'store' && !session.storeId) {
    return NextResponse.json({ error: '所属店舗が特定できないため送信できません' }, { status: 400 });
  }

  const admin = createAdminClient();

  // レート制限: 同一ユーザーの直近24時間の投稿がRATE_LIMIT_MAX件以上なら拒否する。
  // 書込みはこのAPI（service role）に集約されているため、ここを抜けられても
  // 「他人の要望を読む・書き換える」経路には繋がらない（RLSで別途保護済み）
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countError } = await admin
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.id)
    .gte('created_at', since);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: '送信回数の上限に達しました。しばらくしてから再度お試しください' },
      { status: 429 },
    );
  }

  // user_id は必ずセッションから取る（リクエストボディの値は信用しない）。
  // store_id はDBトリガー(set_feedback_store_id)がuser_idから導出するため、ここでは送らない
  const { data, error } = await admin
    .from('feedback')
    .insert({ user_id: session.id, destination, category, body, app_version: appVersion })
    .select('id')
    .single();

  if (error || !data) {
    // 生のPostgresエラー文（制約名・列名を含む）を画面に出さない。
    // 到達しうるのは想定外のケースだけなので、原因調査用にサーバーログへ残す
    if (error) console.error('[feedback] 保存に失敗しました', error);
    return NextResponse.json({ error: '送信に失敗しました' }, { status: 400 });
  }

  if (destination === 'dev') {
    let githubIssueNumber: number | null = null;
    try {
      githubIssueNumber = await createGithubIssue({
        category,
        body,
        appVersion,
        role: session.role,
        userAgent,
      });
    } catch (e) {
      // Issue作成に失敗しても要望自体は保存済みなので処理を継続する。
      // ユーザーには失敗を見せず、サーバーログにのみ残す
      console.error('[feedback] GitHub Issue作成に失敗しました', e);
    }
    if (githubIssueNumber !== null) {
      const { error: updateError } = await admin
        .from('feedback')
        .update({ github_issue_number: githubIssueNumber })
        .eq('id', data.id);
      if (updateError) console.error('[feedback] github_issue_numberの更新に失敗しました', updateError);
    }
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof b?.id === 'string' ? b.id : '';
  const status = typeof b?.status === 'string' ? b.status : '';
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (!isStatus(status)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const admin = createAdminClient();

  // service role は RLS を迂回するため、ここで絞らないと店舗管理者が他店の
  // 要望を書き換えられてしまう。本部管理者以外は「自店に届いたdestination='store'
  // の行」だけに更新対象を限定する
  let query = admin.from('feedback').update({ status }).eq('id', id);
  if (!isHqRole(session.role)) {
    if (!session.storeId) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    query = query.eq('store_id', session.storeId).eq('destination', 'store');
  }

  // .select()を付けずにupdateすると、対象idが1件も無くてもerrorはnullのまま返ってくる
  // （0件更新は失敗ではなく「該当なし」として扱われるため）。上記の店舗フィルタで
  // 絞り込まれて0件になった場合（＝他店の要望を操作しようとした場合）も「見つからない」
  // として扱いたいので、更新できた行を明示的に受け取って件数を確認する
  const { data, error } = await query.select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: '要望が見つかりません' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

// GitHubにIssueを作成する。
// ★店舗名・店舗slug・store_id・氏名・user_idは絶対に含めない★
// このIssueは外部サービス(GitHub)に送られ、リポジトリを見られる誰にでも公開されうる。
// 個人・店舗を特定できる情報を含めると、要望・不具合報告のつもりが意図せず
// 個人情報・取引先情報の漏洩になってしまうため、「本文・種別・アプリバージョン・
// ロール・User-Agent・送信日時」以外は載せない。
async function createGithubIssue(params: {
  category: FeedbackCategory;
  body: string;
  appVersion: string;
  role: string;
  userAgent: string;
}): Promise<number | null> {
  const token = process.env.GITHUB_TOKEN;
  // トークン未設定でも要望送信自体は動作させる（ローカル開発・未設定環境向け）
  if (!token) return null;

  const { category, body, appVersion, role, userAgent } = params;
  const titlePrefix = category === 'bug' ? '[不具合] ' : '[要望] ';
  const titleBody = body.replace(/\s+/g, ' ').slice(0, 40);
  const title = `${titlePrefix}${titleBody}`;

  const issueBody = [
    `**種別**: ${category === 'bug' ? '不具合' : '要望'}`,
    `**ロール**: ${role}`,
    `**アプリバージョン**: ${appVersion || '(不明)'}`,
    `**送信日時**: ${new Date().toISOString()}`,
    `**User-Agent**: ${userAgent || '(不明)'}`,
    '',
    '---',
    '',
    body,
  ].join('\n');

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body: issueBody, labels: ['feedback'] }),
  });

  if (!res.ok) {
    // ★応答本文を必ずログに含める★ ステータスだけでは原因が特定できない。
    // 特に403は「トークンは有効だが権限が足りない」で、本文の message に
    // "Resource not accessible by personal access token" のような理由が入っている。
    // トークン自体は絶対にログへ出さないこと（Authorizationヘッダは触れない）。
    const detail = await res.text().catch(() => '');
    throw new Error(
      `GitHub Issue作成に失敗しました (status: ${res.status}, repo: ${GITHUB_REPO}) ${detail.slice(0, 300)}`,
    );
  }

  const issue = (await res.json()) as { number?: number };
  return typeof issue.number === 'number' ? issue.number : null;
}
