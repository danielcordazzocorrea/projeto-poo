import InteractiveNeuralVortex from '@/components/ui/interactive-neural-vortex-background';

export function DemoOne() {
  return <div className="relative h-screen w-full overflow-hidden bg-black">
    <InteractiveNeuralVortex className="absolute inset-0" />
  </div>;
}
