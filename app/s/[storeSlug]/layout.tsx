import { StoreProvider } from '@/lib/store';

// /s/[storeSlug]/... 配下の全ページを店舗コンテキストでラップする。
// サーバーコンポーネントのまま params(Promise) を解決し、実際の店舗解決(DB問い合わせ)は
// クライアント側の StoreProvider に委ねる。
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <StoreProvider storeSlug={storeSlug}>{children}</StoreProvider>;
}
