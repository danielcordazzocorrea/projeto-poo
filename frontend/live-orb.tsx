import { LiveOrb as Orb } from '@/components/ui/live-orb';
import type { Theme } from '@/lib/theme';

// White/green clouds in light mode; black/green clouds in dark mode.
const palettes = {
  light: ['#83c96e', '#ffffff', '#b8ef91'],
  dark: ['#0c0d0c', '#4c9330', '#14291e'],
};

export function LiveOrb({ theme }: { theme: Theme }) {
  return <aside className="live-orb" aria-hidden>
    <Orb
      className="live-orb-character"
      variant="webgl"
      theme={theme}
      colors={palettes[theme]}
      eyeColor={theme === 'dark' ? '#ffffff' : '#0c0d0c'}
    />
  </aside>;
}
