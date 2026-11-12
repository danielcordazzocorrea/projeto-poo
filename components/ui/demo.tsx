import AnoAI from '@/components/ui/animated-shader-background';

export function DemoOne() {
  return <div className="relative h-screen w-full overflow-hidden bg-black">
    <AnoAI className="absolute inset-0 size-full" />
  </div>;
}
