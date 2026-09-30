import toast from 'react-hot-toast';

export type Attribute = 'wisdom' | 'health' | 'capability' | 'wealth';

export const ATTRIBUTES: Attribute[] = ['wisdom', 'health', 'capability', 'wealth'];

// Colors are floatingsphere's status palette (busy / idle / background-run / amber).
export const ATTR_META: Record<Attribute, { label: string; bar: string; text: string; dot: string; hex: string }> = {
  wisdom: { label: 'Wisdom', bar: 'bg-[#a854f7]', text: 'text-[#8b3fd9] dark:text-[#c58cfa]', dot: 'bg-[#a854f7]', hex: '#a854f7' },
  health: { label: 'Health', bar: 'bg-[#1fa874]', text: 'text-[#16865c] dark:text-[#4fd6a0]', dot: 'bg-[#1fa874]', hex: '#1fa874' },
  capability: { label: 'Capability', bar: 'bg-[#3987e5]', text: 'text-[#2a6fc4] dark:text-[#7ab3f5]', dot: 'bg-[#3987e5]', hex: '#3987e5' },
  wealth: { label: 'Wealth', bar: 'bg-[#fabf40]', text: 'text-[#a86f06] dark:text-[#fabf40]', dot: 'bg-[#fabf40]', hex: '#fabf40' },
};

export interface XpAward {
  attribute: Attribute;
  amount: number;
  crit: boolean;
  capped?: boolean;
  levelUp?: number;
  garden?: string;
  unlocked?: string;
  seed?: string;
}

const SOUND_KEY = 'besmart-garden-sound';

export function soundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

let audio: AudioContext | null = null;

export function chime(notes: number[]) {
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

export function confetti(count: number, colors: string[]) {
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
// `label` names what earned it when that isn't the item just completed (e.g. a bonus check-in).
export function celebrate(award: XpAward | null | undefined, label?: string) {
  if (!award) return;
  const meta = ATTR_META[award.attribute];
  if (award.capped) {
    toast(`Daily review XP cap reached${award.garden ? ` · ${award.garden}` : ''}`, { id: 'xp-cap' });
    return;
  }
  if (award.amount <= 0) return;

  toast(
    `${label ? `${label} · ` : ''}${award.crit ? 'Critical · ' : ''}+${award.amount} ${meta.label} XP${award.garden ? ` · ${award.garden}` : ''}`,
    {
      duration: 2600,
      icon: <span className="dot !w-2.5 !h-2.5" style={{ background: meta.hex }} />,
      style: { borderColor: meta.hex },
    },
  );

  if (award.levelUp) {
    confetti(70, ['#a854f7', '#1fa874', '#3987e5', '#fabf40']);
    chime([523, 659, 784, 1047]);
    const extras = [award.unlocked && `${award.unlocked} unlocked`, award.seed && `${award.seed} seed earned`].filter(Boolean);
    toast(`${meta.label} reached level ${award.levelUp}${extras.length ? ` · ${extras.join(' · ')}` : ''}`, { duration: 4500, style: { fontWeight: 700 } });
  } else if (award.crit) {
    confetti(40, [meta.hex, '#fabf40', '#edf0f5']);
    chime([659, 880, 1175]);
  } else {
    confetti(16, [meta.hex, '#fabf40']);
    chime([784, 1047]);
  }
}
