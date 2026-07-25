'use client';
import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';

export function useTableExport(year: number, month: number) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportImage = async () => {
    if (!tableRef.current) return;
    setExporting(true);
    // exportMode の再レンダー（今日ハイライト等の除去）がDOMに反映されるのを待つ
    await new Promise(r => setTimeout(r, 50));

    const el = tableRef.current;

    // 元のスタイルを保存
    const prev = {
      overflow: el.style.overflow,
      width: el.style.width,
      height: el.style.height,
      maxHeight: el.style.maxHeight,
    };
    const stickyCells = el.querySelectorAll<HTMLElement>('.sticky');

    let objectUrl: string | null = null;
    try {
      // 全体が描画されるよう一時的に展開
      el.style.overflow = 'visible';
      el.style.width = el.scrollWidth + 'px';
      el.style.height = el.scrollHeight + 'px';
      el.style.maxHeight = 'none';
      stickyCells.forEach(c => { c.style.position = 'relative'; });

      // ブラウザに1フレーム再描画させてから撮影
      await new Promise(r => requestAnimationFrame(r));

      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: el.scrollWidth,
        height: el.scrollHeight,
      });

      const today = new Date();
      const monthLabel = `${year}年${month + 1}月 シフト表`;
      const dateLabel = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')} 版`;

      const img = new Image();
      await new Promise<void>(r => { img.onload = () => r(); img.src = dataUrl; });

      const topPad = 72;  // 月ラベル用
      const botPad = 40;  // 保存日用
      const out = document.createElement('canvas');
      out.width = img.width;
      out.height = topPad + img.height + botPad;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);

      // 上部: 月ラベル（大きく・左寄せ）
      ctx.font = `bold ${42}px sans-serif`;
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'left';
      ctx.fillText(monthLabel, 24, 52);

      // テーブル本体
      ctx.drawImage(img, 0, topPad);

      // 下部: 保存日（小さく・右寄せ）
      ctx.font = `${20}px sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(dateLabel, out.width - 24, topPad + img.height + 28);

      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

      await new Promise<void>((resolve, reject) => {
        out.toBlob(blob => {
          if (!blob) { reject(new Error('blob is null')); return; }
          objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = `シフト表_${year}年${month + 1}月_${dateStr}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      console.error('シフト表の画像保存に失敗しました', err);
      alert('画像の保存に失敗しました。コンソールを確認してください。');
    } finally {
      // 必ず元のスタイルに戻す
      el.style.overflow = prev.overflow;
      el.style.width = prev.width;
      el.style.height = prev.height;
      el.style.maxHeight = prev.maxHeight;
      stickyCells.forEach(c => { c.style.position = ''; });
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 10000);
      setExporting(false);
    }
  };

  return { tableRef, exporting, handleExportImage };
}
