// 要望の未対応件数バッジを、同じタブの中で更新するための合図。
//
// バッジは NavBar・HqNav・設定画面の3か所にあり、それぞれ Realtime で
// feedback テーブルの変更を拾って再計算している。ところが「対応済みにする」は
// サーバー側の管理キーで更新するため、購読しているクライアントに変更が届かず、
// バッジだけが古い件数のまま残っていた（リロードすると正しくなる）。
//
// 更新した画面から明示的に合図を出し、バッジ側はそれを聞いて数え直す。
// Realtime の経路はそのまま残してあるので、他のタブや他の端末からの変更も従来どおり反映される。

const FEEDBACK_CHANGED = 'feedback:changed';

/** 要望を更新・削除した直後に呼ぶ */
export function notifyFeedbackChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(FEEDBACK_CHANGED));
}

/** バッジ側で購読する。返り値を useEffect のクリーンアップに使う */
export function onFeedbackChanged(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(FEEDBACK_CHANGED, handler);
  return () => window.removeEventListener(FEEDBACK_CHANGED, handler);
}
