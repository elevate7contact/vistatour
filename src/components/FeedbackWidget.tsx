'use client';

/**
 * FeedbackWidget
 * ─────────────────────────────────────────────────────────────────
 * Botón flotante esquina inferior izquierda. Click → expande panel
 * con: rating up/down/meh, "¿pagarías por esto?", textarea opcional.
 *
 * Diseñado para que un realtor que ve el tour pueda responder en
 * 5 segundos sin hablar con nadie. Los datos van a /api/feedback.
 */
import { useState } from 'react';
import { ThumbsUp, ThumbsDown, X, MessageSquare } from 'lucide-react';

interface Props {
  tourId?: string;
}

type Rating = 'up' | 'down' | 'meh';
type WouldPay = 'yes' | 'no' | 'maybe';

export default function FeedbackWidget({ tourId }: Props) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [wouldPay, setWouldPay] = useState<WouldPay | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!rating) return;
    setSending(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId, rating, wouldPay, comment }),
      });
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        // No reset — si vuelven a abrir, ya quedó marcado como enviado
      }, 1800);
    } catch {
      // silent fail; UX más importante que log
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 bg-paseo-gold text-paseo-dark px-4 py-2.5 rounded-full text-sm font-medium shadow-xl hover:scale-105 transition flex items-center gap-2"
        aria-label="Dar feedback"
        title="¿Qué te pareció el paseo?"
      >
        <MessageSquare size={16} />
        ¿Qué te parece?
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 bg-paseo-dark/95 backdrop-blur-md border border-paseo-gold/30 rounded-2xl p-5 shadow-2xl w-[320px] text-paseo-cream">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-paseo-gold font-medium text-sm">Tu feedback</div>
          <div className="text-xs text-paseo-cream/60">30 segundos. Anónimo.</div>
        </div>
        <button onClick={() => setOpen(false)} className="text-paseo-cream/50 hover:text-paseo-cream" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      {sent ? (
        <div className="py-6 text-center">
          <div className="text-paseo-gold text-2xl mb-1">✓</div>
          <div className="text-sm">Gracias. De verdad.</div>
        </div>
      ) : (
        <>
          {/* Rating */}
          <div className="text-xs text-paseo-cream/70 mb-2">¿Te gustó cómo se ve?</div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setRating('up')}
              className={`flex-1 py-2 rounded-lg border transition flex items-center justify-center gap-1.5 text-sm ${
                rating === 'up' ? 'bg-paseo-gold text-paseo-dark border-paseo-gold' : 'border-white/20 hover:border-white/40'
              }`}
            >
              <ThumbsUp size={14} /> Sí
            </button>
            <button
              onClick={() => setRating('meh')}
              className={`flex-1 py-2 rounded-lg border transition text-sm ${
                rating === 'meh' ? 'bg-paseo-gold text-paseo-dark border-paseo-gold' : 'border-white/20 hover:border-white/40'
              }`}
            >
              Meh
            </button>
            <button
              onClick={() => setRating('down')}
              className={`flex-1 py-2 rounded-lg border transition flex items-center justify-center gap-1.5 text-sm ${
                rating === 'down' ? 'bg-paseo-gold text-paseo-dark border-paseo-gold' : 'border-white/20 hover:border-white/40'
              }`}
            >
              <ThumbsDown size={14} /> No
            </button>
          </div>

          {/* Would pay */}
          <div className="text-xs text-paseo-cream/70 mb-2">¿Pagarías por hacer esto con tus inmuebles?</div>
          <div className="flex gap-2 mb-4">
            {(['yes', 'maybe', 'no'] as WouldPay[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setWouldPay(opt)}
                className={`flex-1 py-1.5 rounded-lg border text-xs transition ${
                  wouldPay === opt ? 'bg-paseo-gold/20 border-paseo-gold text-paseo-gold' : 'border-white/20 hover:border-white/40'
                }`}
              >
                {opt === 'yes' ? 'Sí' : opt === 'maybe' ? 'Tal vez' : 'No'}
              </button>
            ))}
          </div>

          {/* Comment */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Una línea de comentario (opcional)…"
            maxLength={500}
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-paseo-cream/40 focus:border-paseo-gold focus:outline-none mb-3 resize-none"
          />

          <button
            onClick={submit}
            disabled={!rating || sending}
            className="w-full bg-paseo-gold text-paseo-dark py-2 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </>
      )}
    </div>
  );
}
