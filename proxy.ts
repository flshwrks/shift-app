import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionCookie, SESSION_COOKIE } from '@/lib/session';
import { isHqRole } from '@/lib/types';
import { homePathFor, storeLoginPath, HQ_LOGIN } from '@/lib/routes';

// ============================================================================
// 設計上の注意（多層防御・Proxyだけに頼らないこと）
// ----------------------------------------------------------------------------
// Next.js 16では middleware.ts が proxy.ts に改称された（ファイル規約は
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
// を参照）。ここで行っているのは未ログイン・誤った店舗URLへのアクセスを
// 早期にリダイレクトするUI最適化であり、認可の最終防衛線ではない。
// Next.js公式ドキュメントも「Proxyのmatcherを変更・リファクタした際に
// 意図せず保護が外れるリスクがあるため、各Server Function / Route Handler側
// でも必ず検証すること」と明記している。実際、店舗境界の実体チェックは
// app/api/admin/users/route.ts 等の requireAdmin() / requireHqAdmin() /
// session.storeId 比較にある。このファイルを取り除いても、それらのAPI側の
// チェックだけでデータ漏洩は起きない状態を維持すること（既存チェックは
// 一切外さない）。
// ============================================================================

// Proxyの既定ランタイムはNode.js（`runtime` configを書くとエラーになるため
// 設定しない）。lib/session.ts の crypto.createHmac をそのまま呼び出せる。

function redirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const raw = request.cookies.get(SESSION_COOKIE.name)?.value;
  const session = raw ? verifySessionCookie(raw) : null;

  // --- /admin/* : 本部管理者向け（/admin/login は未ログインでアクセスするため除外） ---
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (pathname === HQ_LOGIN) return NextResponse.next();

    if (!session || !isHqRole(session.role)) {
      return redirect(request, HQ_LOGIN);
    }
    return NextResponse.next();
  }

  // --- /s/[slug]/... : 店舗配下 ---
  if (pathname === '/s' || pathname.startsWith('/s/')) {
    const segments = pathname.split('/').filter(Boolean); // ['s', slug, area, ...]
    const slug = segments[1];
    const area = segments[2]; // 'login' | 'admin' | 'staff'
    if (!slug) return NextResponse.next();

    // ログイン画面は未ログインでアクセスする画面のためガードしない
    if (area === 'login') return NextResponse.next();

    if (!session) {
      return redirect(request, storeLoginPath(slug));
    }

    if (isHqRole(session.role)) {
      // 本部権限は任意店舗のadmin配下を横断管理できる。staff配下は本来の
      // 導線ではないため、その店舗の管理画面へ寄せる。
      if (area === 'staff') {
        return redirect(request, `/s/${slug}/admin/schedule`);
      }
      return NextResponse.next();
    }

    // verifySessionCookie が「店舗ロールなら storeSlug 必須」を保証しているので
    // ここに来る時点で非nullのはずだが、万一nullだと下のリダイレクト先が
    // /s/null/... になり無限ループするため、明示的にログインへ落とす
    if (!session.storeSlug) {
      return redirect(request, storeLoginPath(slug));
    }

    // 店舗スタッフ/店舗管理者はURL上のslugと自分の所属店舗が一致しない場合、
    // 自分の店舗へ引き戻す（他店URLへの直リンク・誤誘導を防ぐ）
    if (session.storeSlug !== slug) {
      return redirect(request, homePathFor(session.role, session.storeSlug));
    }

    // 自店だが、staffがadmin配下にアクセスした場合はstaff画面へ戻す
    if (area === 'admin' && session.role !== 'admin') {
      return redirect(request, `/s/${slug}/staff/shifts`);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/s/:path*', '/admin/:path*'],
};
