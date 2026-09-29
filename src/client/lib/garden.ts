import toast from 'react-hot-toast';

export type Attribute = 'wisdom' | 'health' | 'capability' | 'wealth';

export const ATTRIBUTES: Attribute[] = ['wisdom', 'health', 'capability', 'wealth'];

export const ATTR_META: Record<Attribute, { label: string; emoji: string; bar: string; text: string; chip: string; hex: string }> = {
  wisdom: { label: 'Wisdom', emoji: '🧠', bar: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', chip: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300', hex: '#8b5cf6' },
  health: { label: 'Health', emoji: '💪', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300', hex: '#10b981' },
  capability: { label: 'Capability', emoji: '🛠', bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300', hex: '#0ea5e9' },
  wealth: { label: 'Wealth', emoji: '💰', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300', hex: '#f59e0b' },
};

export interface XpAward {
  attribute: Attribute;
  amount: number;
  crit: boolean;
  capped?: boolean;
  levelUp?: number;
}

const SOUND_KEY = 'besmart-garden-sound';

export function soundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

let audio: AudioContext | null = null;

function chime(notes: number[]) {
  if (!soundEnabled()) return;
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    notes.forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.07, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch { /* audio unavailable */ }
}

function confetti(count: number, colors: string[]) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const originX = window.innerWidth / 2;
  const originY = window.innerHeight * 0.45;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = 5 + Math.random() * 6;
    Object.assign(el.style, {
      position: 'fixed', left: `${originX}px`, top: `${originY}px`, width: `${size}px`, height: `${size * 0.6}px`,
      background: colors[i % colors.length], borderRadius: '2px', pointerEvents: 'none', zIndex: '9999',
    });
    document.body.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 60;
    el.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy + 220}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.6,.4,1)' },
    ).onfinish = () => el.remove();
  }
}

// Called by the API client for every mutation response carrying `xp` / `bonus`.
export function celebrate(award: XpAward | null | undefined) {
  if (!award) return;
  const meta = ATTR_META[award.attribute];
  if (award.capped) {
    toast('Review XP cap reached for today. Everything else is pure learning 🌿', { id: 'xp-cap' });
    return;
  }
  if (award.amount <= 0) return;

  toast(
    `${award.crit ? '✨ Critical! ' : ''}+${award.amount} ${meta.emoji} ${meta.label}`,
    { duration: 2200, style: { fontWeight: 600, color: meta.hex } },
  );

  if (award.levelUp) {
    confetti(70, ['#8b5cf6', '#10b981', '#0ea5e9', '#f59e0b', '#f43f5e']);
    chime([523, 659, 784, 1047]);
    toast(`🎉 ${meta.label} reached level ${award.levelUp}!`, { duration: 4000, style: { fontWeight: 700 } });
  } else if (award.crit) {
    confetti(40, [meta.hex, '#fbbf24', '#f472b6']);
    chime([659, 880, 1175]);
  } else {
    confetti(16, [meta.hex, '#fbbf24']);
    chime([784, 1047]);
  }
}
