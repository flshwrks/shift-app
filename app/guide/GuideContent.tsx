'use client';
import { useState } from 'react';
import Image from 'next/image';

// 詳しい使い方。役割を選ぶと、その役割の手順だけが出る。
//
// 方針:
//  - どの店舗でも使える内容にする。特定の店舗名・特定のURLを書かない
//    （ログインURLは店舗ごとに違うため、値ではなく入手方法を書く）
//  - 「なぜそう作ったか」は書かない。何ができて、どう操作するかだけを書く
//  - 画面写真はテスト店舗のもの。実在のスタッフ名は含まれない

type Role = 'staff' | 'admin' | 'hq';

const ROLES: { id: Role; name: string; scope: string; summary: string }[] = [
  { id: 'staff', name: 'スタッフ', scope: '自分のシフト',
    summary: '希望を出す、確定したシフトを見る、依頼に答える。' },
  { id: 'admin', name: '店舗管理者', scope: '自分の店舗',
    summary: 'シフトを確定する、人手を埋める、スタッフと設定を管理する。' },
  { id: 'hq', name: '本部管理者', scope: '全店舗',
    summary: '店舗を追加・編集する、全店舗を横断して見る。' },
];

/* ---------- 共通の小さな部品 ---------- */

function Section({ id, title, where, children }: {
  id: string; title: string; where?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="flex items-baseline gap-2 flex-wrap border-b border-slate-200 pb-2 mb-3">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {where && <span className="text-xs text-slate-500">{where}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center mt-0.5 tabular-nums">
            {i + 1}
          </span>
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 leading-relaxed">
      {children}
    </p>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 leading-relaxed">
      {children}
    </p>
  );
}

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="my-3">
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-full">
        <Image src={src} alt={alt} width={760} height={0}
               style={{ height: 'auto', width: '100%', maxWidth: 380 }} unoptimized />
      </div>
      <figcaption className="text-xs text-slate-500 mt-1.5 leading-relaxed">{caption}</figcaption>
    </figure>
  );
}

function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
      {items.map(({ q, a }) => (
        <details key={q} className="group">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center justify-between gap-2">
            <span>{q}</span>
            <span className="text-slate-400 text-xs flex-shrink-0 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="px-4 pb-3.5 text-sm text-slate-600 space-y-1.5 leading-relaxed">{a}</div>
        </details>
      ))}
    </div>
  );
}

/* ---------- 権限の一覧（3つの役割で共通の事実なので1か所に持つ） ---------- */

const CAN_DO: [string, boolean, boolean, boolean][] = [
  ['シフトを希望する', true, true, false],
  ['シフト表を見る', true, true, true],
  ['シフトを確定する', false, true, true],
  ['調整依頼に答える', true, true, false],
  ['調整依頼を出す', false, true, true],
  ['スタッフを追加・編集する', false, true, true],
  ['提出期間を決める', false, true, true],
  ['シフト種別を設定する', false, true, true],
  ['人件費を見積もる', false, true, true],
  ['アンケートを取る', false, true, true],
  ['要望を送る', true, false, false],
  ['店舗を追加・編集する', false, false, true],
  ['店舗名を変える', false, false, true],
];

function PermissionTable() {
  const mark = (v: boolean) => (
    <span className={v ? 'text-slate-900 font-bold' : 'text-slate-300'}>{v ? '○' : '—'}</span>
  );
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
      <table className="w-full text-sm min-w-[26rem]">
        <thead>
          <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
            <th className="text-left font-medium px-3 py-2">できること</th>
            <th className="font-medium px-2 py-2 w-20">スタッフ</th>
            <th className="font-medium px-2 py-2 w-24">店舗管理者</th>
            <th className="font-medium px-2 py-2 w-24">本部管理者</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {CAN_DO.map(([label, s, a, h]) => (
            <tr key={label}>
              <td className="px-3 py-1.5 text-slate-700">{label}</td>
              <td className="px-2 py-1.5 text-center">{mark(s)}</td>
              <td className="px-2 py-1.5 text-center">{mark(a)}</td>
              <td className="px-2 py-1.5 text-center">{mark(h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 全役割に共通の説明 ---------- */

function CommonBasics() {
  return (
    <>
      <Section id="url" title="開くところ">
        <p className="text-sm text-slate-700 leading-relaxed">
          <b>ログインURLは店舗ごとに違います。</b>
          自分の店舗のURLは、店頭に掲示されたQRコードか、店舗管理者から配られたリンクを使ってください。
        </p>
        <Note>
          インストールは要りません。ブラウザで開いてホーム画面に追加しておくと、次から一発で開けます。
          一度ログインすると30日間そのままです。
        </Note>
      </Section>

      <Section id="shift-types" title="シフトの種類">
        <p className="text-sm text-slate-700 leading-relaxed">
          シフトの種類は<b>店舗ごとに設定します</b>。記号・名前・時間帯・数は店舗によって違います。
          自分の店舗の設定は、シフトを入力する画面の凡例で確認できます。
        </p>
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・<b>記号つきの種類</b>（A、B、C…）— 店舗が決めた時間帯。最大12種類</li>
          <li>・<b>カスタム</b> — 8:00〜22:00 のあいだで30分刻みに自分で指定する</li>
          <li>・<b>休み / 申請なし</b> — その日は働かない</li>
        </ul>
        <Note>
          店舗の設定が変わっても、<b>すでに入っているシフトの時刻は変わりません</b>。
          変わるのは、次にその種類を選んだときに入る時刻です。
        </Note>
      </Section>

      <Section id="hours" title="実働時間">
        <p className="text-sm text-slate-700 leading-relaxed">
          画面に出る実働時間は、労働基準法の休憩ぶんを自動で差し引いた<b>実際に働く時間</b>です。拘束時間ではありません。
        </p>
        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-50">
              <tr><td className="px-3 py-1.5 text-slate-700">実働が8時間を超える</td><td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">− 60分</td></tr>
              <tr><td className="px-3 py-1.5 text-slate-700">実働が6時間超〜8時間以下</td><td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">− 45分</td></tr>
              <tr><td className="px-3 py-1.5 text-slate-700">実働が6時間以下</td><td className="px-3 py-1.5 text-right text-slate-500">控除なし</td></tr>
            </tbody>
          </table>
        </div>
        <Note>
          例：8:00〜17:00（9時間）の種類なら、60分を引いて実働8時間と表示されます。
        </Note>
      </Section>
    </>
  );
}

/* ---------- スタッフ ---------- */

function StaffGuide() {
  return (
    <div className="space-y-8">
      <Section id="s-login" title="ログインする">
        <Steps items={[
          '自分の店舗のログインURLを開く',
          '一覧から自分の名前をタップする',
          '4桁の暗証番号を入力する。4桁目を入れた時点で自動的に入ります（決定ボタンはありません）',
        ]} />
        <Shot src="/guide/01.jpg" alt="ログイン画面。スタッフの名前がカードで並んでいる"
              caption="自分の名前をタップします。" />
        <Shot src="/guide/02.jpg" alt="暗証番号の入力画面。数字パッドと4つの入力位置"
              caption="4桁目を入れた時点で自動的にログインします。" />
        <Warn>
          5回続けて間違えると15分ロックされます。時間をおくか、店舗管理者に再設定してもらってください。
        </Warn>
      </Section>

      <CommonBasics />

      <Section id="s-screen" title="画面の見かた">
        <p className="text-sm text-slate-700 leading-relaxed">
          上がヘッダー、下がナビです。ヘッダーには「どの店舗を見ているか」と「誰でログインしているか」が出ます。
          右上の「≡」に、使い方・要望を送る・更新履歴・ログアウトが入っています。
        </p>
        <Shot src="/guide/03.jpg" alt="「≡」メニュー。使い方・要望を送る・更新履歴・ログアウトが並ぶ"
              caption="困ったときはここを開きます。" />
        <Note>ナビにオレンジの数字が付いていたら、未対応の調整依頼がある合図です。</Note>
      </Section>

      <Section id="s-period" title="提出できる期間">
        <p className="text-sm text-slate-700 leading-relaxed">
          月ごとに「いつからいつまで希望を出せるか」を店舗管理者が決めます。期間の外だと入力も提出もできません。
        </p>
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・<b>期間が決まっている月</b>：その期間内だけ提出できます。期間外はボタンが消え、理由が赤く出ます</li>
          <li>・<b>期間が決まっていない月</b>：いつでも提出できます</li>
          <li>・<b>3か月以上先の月</b>：期間が未設定でも入力できません</li>
        </ul>
        <Note>入力できないときは、まず開いている月を確認してください。先の月を開いているだけ、ということがよくあります。</Note>
      </Section>

      <Section id="s-request" title="シフトを希望する" where="ナビ｜申請">
        <Steps items={[
          'ナビの「申請」を開く。提出期間が決まっている月は、自動的にその月が開きます',
          '希望する日の行の「入力」をタップ',
          'シフトの種類かカスタムを選んで「決定」。休みたい日は「休み / 申請なし」',
          '全部入れ終わったら、画面下の「X日分をまとめて提出」をタップ',
          '各日のバッジが「申請中」に変われば、管理者に届いています',
        ]} />
        <Shot src="/guide/04.jpg" alt="シフト申請画面。日付ごとの入力欄と、下部のまとめて提出ボタン"
              caption="下の「まとめて提出」を押すまでは、まだ届いていません。" />
        <Warn>
          <b>入力しただけでは提出されていません。</b>
          最後の「まとめて提出」まで押してください。提出前の内容はこの端末にだけ保存されています。
        </Warn>
        <Note>
          前月コピー（先月と同じ曜日パターンを引き継ぐ）と、複数日コピー（入力済みの1日を他の日へ一括適用）があります。<br />
          管理者が確定したあとのシフトは、自分では編集できません。変えたい場合は管理者に相談してください。
        </Note>
      </Section>

      <Section id="s-view" title="シフト表を見る" where="ナビ｜確認">
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・<b>表形式</b>：日付 × スタッフの表。自分の列は強調されます。上部に「実働時間」、右端に自分の「月計」が出ます</li>
          <li>・<b>タイムライン</b>：時間帯 × 日の図。誰といつ一緒に入るかが分かります</li>
          <li>・シフトをタップすると、開始・終了時刻と状態が出ます</li>
          <li>・管理者が入れた日ごとのメモもここに出ます</li>
          <li>・画像として保存できるので、印刷や共有にも使えます</li>
        </ul>
        <Shot src="/guide/05.jpg" alt="シフト確認画面の表形式。上部に実働時間の行がある"
              caption="いちばん上の行が、その日の出勤者全員を合計した実働時間です。" />
        <Note>誰かが変更するとその場ですぐ反映されます。開き直す必要はありません。</Note>
      </Section>

      <Section id="s-swap" title="調整依頼に答える" where="ナビ｜依頼">
        <p className="text-sm text-slate-700 leading-relaxed">人手が足りない日に、管理者から依頼が届きます。2種類あります。</p>
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・<b>指名型</b>：あなた宛ての依頼です。「受ける」「断る」で答えます</li>
          <li>・<b>掲示板型</b>：全員に出ている依頼で早い者勝ち。誰かが先に受けると締め切られます</li>
        </ul>
        <Shot src="/guide/06.jpg" alt="調整依頼の画面。指名型と掲示板型の依頼が並んでいる"
              caption="「受ける」を押した時点では、まだ確定ではありません。" />
        <Shot src="/guide/07.jpg" alt="ログイン直後に出る調整依頼の通知"
              caption="ログインすると、未対応の依頼をこの形で知らせます。" />
        <Warn>
          「受ける」を押すと、その日のシフトが自動で下書き登録されます。<b>確定するのは管理者です。</b>
          すでにシフトが入っている日なら、上書きしていいか確認が出ます。
        </Warn>
        <Note>日付が過ぎた依頼は自動的に消えます。</Note>
      </Section>

      <Section id="s-survey" title="アンケートに答える" where="ログイン時">
        <p className="text-sm text-slate-700 leading-relaxed">
          未回答のアンケートがあると、ログイン後に自動でポップアップが出ます。選択肢を選んで送信するだけです。
          「その他」がある場合は自由に書けます。
        </p>
        <Note>実施中は同時に1件までです。「後で」を選ぶと、次のログイン時にまた出ます。</Note>
      </Section>

      <Section id="s-feedback" title="要望・不具合を送る" where="メニュー｜≡">
        <Steps items={[
          '右上の「≡」→「要望を送る」',
          '送り先を選ぶ（管理者へ／開発者へ）',
          '「要望」か「不具合」かを選ぶ',
          '内容を書いて送信（2000文字まで）',
        ]} />
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・<b>管理者へ</b>：お店の管理者に届きます。シフトや店舗の運用についての意見はこちら</li>
          <li>・<b>開発者へ</b>：アプリ自体の改善要望・不具合報告</li>
        </ul>
        <Note>
          「開発者へ」送った内容に、お店の名前やあなたの名前は含まれません。<br />
          送った要望は他のスタッフには見えません。
        </Note>
        <Warn>
          「この日を代わってほしい」といった急ぎの相談は、要望ではなく直接伝えてください。
          要望は管理者が見たときに読むもので、すぐ気づく仕組みではありません。
        </Warn>
      </Section>

      <Section id="s-perm" title="誰が何をできるか"><PermissionTable /></Section>

      <Section id="s-faq" title="困ったとき">
        <Faq items={[
          { q: '暗証番号が違うと言われる', a: <>
            <p>5回続けて間違えると15分ロックされます。時間をおくか、店舗管理者に再設定してもらってください。</p>
          </> },
          { q: '入力ボタンが出てこない／提出できない', a: <>
            <p>提出期間の外である可能性が高いです。画面に赤く理由が出ているはずなので、まず読んでください。</p>
            <p>3か月以上先の月は、期間が未設定でも入力できません。開いている月を確認してください。</p>
          </> },
          { q: '提出したはずのシフトが届いていない', a: <>
            <p>入力しただけで「まとめて提出」を押していない可能性があります。各日のバッジが「申請中」になっているか確認してください。</p>
            <p>入力しただけの状態は、その端末にしか保存されていません。</p>
          </> },
          { q: '確定したシフトを変更したい', a: <>
            <p>確定後は自分では編集できません。管理者に相談してください。</p>
            <p>管理者が直接編集するか、他の人へ調整依頼を出す形で入れ替えます。</p>
          </> },
          { q: '要望を送ったのに返事がない', a: <>
            <p>要望に返信する機能はありません。管理者が読んで「対応済み」にするところまでの仕組みです。</p>
            <p>急ぎの用件は、要望ではなく直接伝えてください。</p>
          </> },
          { q: 'ホーム画面に追加したい', a: <>
            <p>iPhoneはSafariの共有ボタン →「ホーム画面に追加」。Androidはブラウザのメニュー →「ホーム画面に追加」です。</p>
            <p>次からアプリのように一発で開けます。ログイン状態は30日続きます。</p>
          </> },
          { q: 'アプリが更新されたか知りたい', a: <>
            <p>バージョンが上がると、ログイン後に画面下へ数秒だけお知らせが出ます。</p>
            <p>見逃しても、右上の「≡」→「更新履歴」からいつでも読めます。</p>
          </> },
        ]} />
      </Section>
    </div>
  );
}

/* ---------- 店舗管理者 ---------- */

function AdminGuide() {
  return (
    <div className="space-y-8">
      <Section id="a-login" title="ログインする">
        <p className="text-sm text-slate-700 leading-relaxed">
          スタッフと同じURL・同じ入り方です。権限が「管理者」になっていれば、ナビが4つになります。
        </p>
        <Note>スタッフができることは全部できます。加えて、以下が使えます。</Note>
      </Section>

      <CommonBasics />

      <Section id="a-screen" title="画面の見かた">
        <p className="text-sm text-slate-700 leading-relaxed">
          ナビはシフト・依頼・スタッフ・設定の4つ。右上の「≡」に使い方・更新履歴・ログアウトが入っています。
        </p>
        <Note>
          ナビのオレンジの数字は未対応の件数です。「依頼」は募集中の件数、「設定」は未対応の要望の件数を表します。
        </Note>
      </Section>

      <Section id="a-confirm" title="申請を確定する" where="ナビ｜シフト">
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・スタッフの申請は「未確定」（黄色）で出ます。確定させると、スタッフ側は編集できなくなります</li>
          <li>・「すべて確定」で一括承認。未確定があるときだけ件数付きで出ます</li>
          <li>・セルをタップすると個別の確認・編集・削除ができます</li>
          <li>・「+ シフト追加」で、申請を待たずに直接入れられます</li>
          <li>・「未提出者」で未提出の人の一覧とリマインダー文が出ます。そのままコピーして送れます</li>
          <li>・日付ごとのメモをここで入力します</li>
        </ul>
        <Shot src="/guide/08.jpg" alt="シフト管理画面。未確定のシフトと「すべて確定」ボタン"
              caption="黄色が未確定です。「すべて確定」は未確定があるときだけ出ます。" />
        <Warn>
          日付ごとのメモは公開シフト表にも出ます。ログイン不要で見られるページなので、個人的な内容は書かないでください。
        </Warn>
      </Section>

      <Section id="a-period" title="提出期間を決める" where="ナビ｜設定">
        <Steps items={[
          '月ごとに開始日と終了日を入れる',
          '日付を変えると「保存」が出るので押す',
          '設定済みの月は「解除」で取り消せます',
        ]} />
        <Note>
          手前の2か月だけ表示されます。先の月は「先の月も設定する」で開きます。<br />
          翌月の期間を今月のうちに決めておくと、スタッフが早めに出せます。
        </Note>
      </Section>

      <Section id="a-types" title="シフト種別を設定する" where="ナビ｜設定 →「編集する」">
        <p className="text-sm text-slate-700 leading-relaxed">
          この店舗で使うシフトの種類を決めます。設定画面では一覧の確認だけができ、変更は「編集する」から専用の画面で行います。
        </p>
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・<b>追加・削除</b>：使う種類を増やしたり減らしたりできます。最大12種類</li>
          <li>・<b>並べ替え</b>：↑↓で入れ替えます。この順番が、シフト入力の画面に出る順番になります</li>
          <li>・<b>表示名</b>：「早番」「通し」などの名前を付けられます（任意）</li>
          <li>・<b>時間帯</b>：開始と終了を選びます</li>
        </ul>
        <Warn>
          <b>すでに入力済みのシフトの時刻は変わりません。</b>変わるのは、次にその種類を選んだときに入る時刻と、一覧の凡例です。<br />
          <b>記号（A、B、C…）は並べ替えても変わりません。</b>過去のシフトがその記号を参照しているためです。
        </Warn>
        <Note>削除した種類で入力済みのシフトはそのまま残り、時刻も従来どおり表示されます。</Note>
      </Section>

      <Section id="a-swap" title="人手が足りない日を埋める" where="ナビ｜依頼">
        <Steps items={[
          '「+ 依頼を出す」を開く。タイムラインの足りないコマをタップすると、日時が入った状態で開けます',
          '指名型（相手を選ぶ）か掲示板型（全員に出して先着1名）を選ぶ',
          '日付・時間帯・メッセージを入れて「依頼を送る」',
          '「募集中」タブで応答（承諾・辞退・未対応）を確認する',
          '承諾されると「承諾済み」タブに移る',
          '「シフトを確定する」で下書きを確定させる',
        ]} />
        <Shot src="/guide/09.jpg" alt="調整依頼の作成画面。指名型と掲示板型の選択"
              caption="掲示板型は全員に出て、先着1名で締め切られます。" />
        <Warn>スタッフが承諾しただけでは確定していません。最後の「シフトを確定する」まで押して完了です。</Warn>
        <Note>
          日付が過ぎた依頼は、この画面を開いたときに自動で削除されます。依頼を消しても、そこから確定したシフトは残ります。
        </Note>
      </Section>

      <Section id="a-staff" title="スタッフを登録・編集する" where="ナビ｜スタッフ">
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・「+ スタッフを追加」で、名前・暗証番号（4桁）・権限（スタッフ / 管理者）を設定します</li>
          <li>・編集から名前・権限・暗証番号を変更できます。忘れた人はここで再設定します</li>
          <li>・「▲▼」の並び順が、そのままシフト表の列の順番になります</li>
        </ul>
        <Note>権限を「管理者」にすると、その人もこのページの内容がすべてできるようになります。</Note>
      </Section>

      <Section id="a-cost" title="人件費を見積もる" where="設定 → 管理メニュー">
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・過去2か月〜先4か月をタブで切り替えます</li>
          <li>・スタッフごとに時給を設定します。<b>初期値は最低賃金なので、実際の時給に直してください</b></li>
          <li>・月間実働時間 × 時給で、スタッフ別と合計の概算が出ます</li>
        </ul>
        <Warn>あくまで概算です。残業割増・深夜割増・各種手当・社会保険料は含まれていません。</Warn>
      </Section>

      <Section id="a-survey" title="アンケートを取る" where="設定 → 管理メニュー">
        <Steps items={[
          'タイトル・説明・選択肢（2つ以上）を入れて下書きを作る。「その他（自由記述）」も追加できます',
          '「公布する」で実施中にする。スタッフのログイン時にポップアップが出ます',
          '結果はその場で集計され、選択肢ごとの得票数と割合が出ます',
        ]} />
        <Warn>実施中は同時に1件までです。新しく公布すると、それまで実施中だったものは自動的に終了します。</Warn>
      </Section>

      <Section id="a-feedback" title="要望を受け取る" where="設定 → 管理メニュー">
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・ここに届くのは、スタッフが「管理者へ」宛てに送ったものだけです</li>
          <li>・「未対応」「対応済み」の2つで管理します</li>
          <li>・対応が終わったら「対応済みにする」。押し間違えたら「未対応に戻す」で戻せます</li>
          <li>・不要になったものは対応済みタブの「削除」で消せます（未対応のものは消せません）</li>
        </ul>
        <Shot src="/guide/10.jpg" alt="要望の受信箱。未対応と対応済みのタブ"
              caption="未対応があると、ナビの「設定」に件数が出ます。" />
        <Note>要望は他のスタッフからは見えません。管理者は要望を送れません。</Note>
      </Section>

      <Section id="a-audit" title="操作の記録を見る" where="設定 → 管理メニュー">
        <p className="text-sm text-slate-700 leading-relaxed">
          誰がいつシフトを変更したか、スタッフを追加・削除したかの記録が残ります。
          「勝手に変えられた」といった申し立てがあったときに確認できます。
        </p>
      </Section>

      <Section id="a-perm" title="誰が何をできるか"><PermissionTable /></Section>

      <Section id="a-faq" title="困ったとき">
        <Faq items={[
          { q: 'スタッフが「提出したのに届いていない」と言う', a: <>
            <p>入力しただけで「まとめて提出」を押していないケースがほとんどです。各日のバッジが「申請中」になっているか確認してもらってください。</p>
            <p>入力しただけの状態は、その人の端末にしか保存されていません。</p>
          </> },
          { q: 'スタッフが暗証番号を忘れた／ロックされた', a: <>
            <p>「スタッフ」→ 対象の人の「編集」から再設定できます。ロックも同時に解除されます。</p>
          </> },
          { q: '確定したシフトを変えたい', a: <>
            <p>「シフト管理」でセルをタップすれば、確定後でも管理者は編集・削除できます。</p>
            <p>他の人に入ってもらう場合は、調整依頼を出すほうが記録が残って分かりやすくなります。</p>
          </> },
          { q: '依頼を出したのに誰も反応しない', a: <>
            <p>スタッフがログインしたときにポップアップで知らせますが、ログインしなければ気づきません。</p>
            <p>急ぐ場合は直接声をかけてください。</p>
          </> },
          { q: 'シフト種別を変えたら、過去のシフトはどうなる', a: <>
            <p>変わりません。すでに入力済みのシフトは、そのときの時刻をそのまま保持しています。</p>
            <p>変わるのは、次にその種類を選んだときに入る時刻と、一覧の凡例です。</p>
          </> },
          { q: '店舗名を変えたい', a: <>
            <p>店舗管理者は変更できません。本部管理者に依頼してください。</p>
            <p>店舗名はログイン画面や公開シフト表にも出るため、本部側で一元的に管理しています。</p>
          </> },
          { q: 'アプリ自体への要望を出したい', a: <>
            <p>管理者からは送れません。本部管理者に伝えてください。</p>
          </> },
        ]} />
      </Section>
    </div>
  );
}

/* ---------- 本部管理者 ---------- */

function HqGuide() {
  return (
    <div className="space-y-8">
      <Section id="h-login" title="ログインする">
        <Steps items={[
          '本部のログインURLを開く',
          '一覧から自分の名前をタップする',
          '4桁の暗証番号を入力する。4桁目を入れた時点で自動的に入ります',
        ]} />
        <Warn>
          店舗のログインURLとは別です。店舗のURLからは本部管理者として入れません。
          本部のURLは店舗に配らないでください。
        </Warn>
      </Section>

      <Section id="h-screen" title="画面の見かた">
        <p className="text-sm text-slate-700 leading-relaxed">
          ヘッダーの下に「店舗一覧」「要望」の2つ。右上の「≡」に使い方・更新履歴・ログアウトが入っています。
        </p>
        <Note>「要望」のオレンジの数字は、開発者へ宛てに届いた未対応の件数です。</Note>
      </Section>

      <Section id="h-stores" title="店舗を管理する" where="店舗一覧">
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・<b>「+ 店舗を追加」</b>：店舗名と店舗IDを決めます。店舗IDはログインURLの一部になります</li>
          <li>・<b>編集</b>：店舗名・店舗IDを変更できます</li>
          <li>・<b>「URLをコピー」</b>：店頭に貼るQRコードはここから作ります</li>
          <li>・<b>「この店舗を管理」</b>：その店舗の管理画面に入り、店舗管理者と同じことができます</li>
        </ul>
        <Shot src="/guide/11.jpg" alt="本部の店舗一覧"
              caption="店頭のQRコードは、ここでコピーしたURLから作ります。" />
        <Note>
          店舗IDには、URLを推測されないようランダムな文字が自動で付きます。
          入力した名前がそのままURLになるわけではありません。
        </Note>
        <Warn>スタッフが1人でも登録されている店舗は削除できません。先にスタッフを削除してください。</Warn>
      </Section>

      <Section id="h-move" title="店舗を行き来する" where="店舗の管理画面">
        <p className="text-sm text-slate-700 leading-relaxed">
          店舗の管理画面を見ているときは、右上の「≡」に「本部管理へ戻る」が出ます。ログインしたまま店舗一覧に戻れます。
        </p>
        <Warn>「ログアウト」と間違えないでください。ログアウトすると暗証番号の入れ直しになります。</Warn>
      </Section>

      <Section id="h-dev" title="開発者宛ての要望を見る" where="要望">
        <ul className="text-sm text-slate-700 space-y-1 leading-relaxed">
          <li>・全店舗のスタッフが「開発者へ」宛てに送ったものが集まります</li>
          <li>・どの店舗の誰が、どのバージョンで送ったかが分かります</li>
          <li>・対応済みにする・未対応に戻す・削除ができます</li>
        </ul>
        <Shot src="/guide/12.jpg" alt="本部の要望一覧"
              caption="店舗名・送信者・バージョンが分かるようになっています。" />
        <Note>
          各店舗の管理者宛ての要望は、ここには出ません。それぞれの店舗の管理画面（設定 → 要望）にあります。
        </Note>
      </Section>

      <Section id="h-errors" title="エラーの記録を見る" where="エラー">
        <p className="text-sm text-slate-700 leading-relaxed">
          利用者の画面やサーバーで起きた想定外のエラーが記録されます。同じ内容はまとめて件数で表示されます。
          即時の通知はないので、定期的に確認してください。
        </p>
      </Section>

      <Section id="h-perm" title="誰が何をできるか">
        <PermissionTable />
        <Note>本部管理者は「シフトを希望する」ができません。どの店舗にも所属していないためです。</Note>
      </Section>

      <Section id="h-faq" title="困ったとき">
        <Faq items={[
          { q: '店舗を削除できない', a: <>
            <p>スタッフが1人でも残っている店舗は削除できません。先にスタッフを削除してください。</p>
          </> },
          { q: '店舗IDを変えたらログインURLはどうなる', a: <>
            <p>ログインURLも変わります。店頭のQRコードを貼り替えてください。</p>
            <p>変更後は「URLをコピー」で新しいURLを取得できます。</p>
          </> },
          { q: '店舗の管理画面から本部に戻れない', a: <>
            <p>右上の「≡」に「本部管理へ戻る」があります。ログアウトする必要はありません。</p>
          </> },
          { q: 'スタッフからの要望が見当たらない', a: <>
            <p>本部の「要望」に出るのは「開発者へ」宛てだけです。</p>
            <p>「管理者へ」宛てのものは、その店舗の管理画面（設定 → 要望）にあります。</p>
          </> },
        ]} />
      </Section>
    </div>
  );
}

/* ---------- 本体 ---------- */

export default function GuideContent() {
  const [role, setRole] = useState<Role | null>(null);

  if (role === null) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">自分の役割を選んでください</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            選んだ役割のページだけを読めば済むようになっています。分からない場合は「スタッフ」から読んでください。
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-400 hover:bg-slate-50 transition-colors"
            >
              <span className="text-[11px] font-bold text-slate-400">{r.scope}</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{r.name}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.summary}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const current = ROLES.find(r => r.id === role)!;

  return (
    <div>
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-5 sticky top-[52px] z-30">
        {ROLES.map(r => (
          <button
            key={r.id}
            onClick={() => { setRole(r.id); window.scrollTo({ top: 0 }); }}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              r.id === role ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-500 mb-6 leading-relaxed">{current.summary}</p>

      {role === 'staff' && <StaffGuide />}
      {role === 'admin' && <AdminGuide />}
      {role === 'hq' && <HqGuide />}
    </div>
  );
}
