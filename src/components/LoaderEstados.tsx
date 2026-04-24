'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const ESTADOS = [
  'Subiendo fotos…',
  'Analizando espacios…',
  'Armando recorrido…',
  'Listo'
];

export default function LoaderEstados({ active }: { active: boolean }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!active) {
      setIdx(0);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setIdx(1), 2200),
      setTimeout(() => setIdx(2), 6500),
      setTimeout(() => setIdx(3), 14000)
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  if (!active) return null;

  return (
    <div className="card p-6 mt-6">
      <ul className="space-y-3">
        {ESTADOS.map((label, i) => {
          const done = i < idx;
          const current = i === idx;
          return (
            <li
              key={label}
              className={`flex items-center gap-3 ${
                done ? 'text-paseo-cream/70' : current ? 'text-paseo-gold' : 'text-paseo-cream/35'
              }`}
            >
              {done ? (
                <Check size={18} />
              ) : current ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <span className="w-[18px] h-[18px] rounded-full border border-paseo-cream/25" />
              )}
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
