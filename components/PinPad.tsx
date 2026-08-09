'use client';

// 4桁PIN入力のテンキーUI。店舗ログイン（通常・開発者モード）と本部ログインの
// 3箇所で同じものを使うため、ドット表示・テンキー・エラー表示をここに集約する。
// PINの値自体は呼び出し側が持つ（入力完了時の処理が画面ごとに異なるため）。

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export const PIN_LENGTH = 4;

interface Props {
  pin: string;
  error?: string;
  disabled?: boolean;
  /** 入力中ドットの色。開発者モードだけトーンを落とすため差し替え可能にしている */
  dotClassName?: string;
  onKey: (key: string) => void;
}

export default function PinPad({ pin, error, disabled, dotClassName = 'bg-blue-600', onKey }: Props) {
  return (
    <>
      <div className="flex justify-center gap-4 mb-6">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all ${i < pin.length ? dotClassName : 'bg-slate-200'}`}
          />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

      <div className="grid grid-cols-3 gap-3 tabular-nums">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => k && onKey(k)}
            disabled={!k || disabled}
            className={`h-14 rounded-xl text-lg font-medium tabular-nums transition-all active:scale-95 ${
              k === ''
                ? 'bg-transparent cursor-default'
                : k === 'del'
                ? 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                : 'bg-white border border-slate-200 hover:bg-slate-50'
            } disabled:opacity-50`}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * テンキー入力を PIN 文字列に反映する共通ロジック。
 * 4桁揃った時点で onComplete を呼ぶ（3画面すべてで同じ挙動）。
 */
export function applyPinKey(
  key: string,
  pin: string,
  setPin: (next: string) => void,
  clearError: () => void,
  onComplete: (code: string) => void
) {
  if (key === 'del') {
    setPin(pin.slice(0, -1));
    clearError();
    return;
  }
  if (pin.length >= PIN_LENGTH) return;
  const next = pin + key;
  setPin(next);
  if (next.length === PIN_LENGTH) onComplete(next);
}
