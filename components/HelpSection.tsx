'use client';
import { useState } from 'react';
import Link from 'next/link';

export interface Step {
  text: string;
  note?: string;
}

export type SectionColor = 'blue' | 'green' | 'purple' | 'slate';

export interface Section {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  color: SectionColor;
  href?: string;
  image?: string;
  steps: Step[];
  tips?: string[];
}

const colorMap: Record<SectionColor, { bg: string; text: string; light: string; border: string; badge: string }> = {
  blue:   { bg: 'bg-blue-600',   text: 'text-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700' },
  green:  { bg: 'bg-green-600',  text: 'text-green-600',  light: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700' },
  purple: { bg: 'bg-purple-600', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  slate:  { bg: 'bg-slate-600',  text: 'text-slate-600',  light: 'bg-slate-50',  border: 'border-slate-200',  badge: 'bg-slate-100 text-slate-600' },
};

export function HelpSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(true);
  const c = colorMap[section.color];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
      >
        <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center text-xl flex-shrink-0`}>
          {section.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-base">{section.title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{section.subtitle}</p>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5">
          <div className="border-t border-slate-100 pt-4 space-y-3">
            {section.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className={`w-6 h-6 rounded-full ${c.bg} text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 leading-relaxed">{step.text}</p>
                  {step.note && (
                    <p className="text-xs text-slate-400 mt-1 pl-2 border-l-2 border-slate-200">{step.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {section.tips && section.tips.length > 0 && (
            <div className={`mt-4 ${c.light} ${c.border} border rounded-xl p-4`}>
              <p className={`text-xs font-bold ${c.text} mb-2 flex items-center gap-1.5`}>
                <span>💡</span> ヒント
              </p>
              <ul className="space-y-1.5">
                {section.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                    <span className="text-slate-300 flex-shrink-0">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section.href && (
            <Link
              href={section.href}
              className={`mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium ${c.badge} transition-opacity hover:opacity-80`}
            >
              {section.title}を開く
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
