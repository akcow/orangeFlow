import { cn } from "@/utils/utils";

export function BorderBeam({
  className,
  size = 200,
  duration = 12,
  colorFrom = "#C661B8",
  colorTo = "#61C6B8",
  anchor = 20,
  borderWidth = 1.5,
}: {
  className?: string;
  size?: number;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  anchor?: number;
  borderWidth?: number;
}) {
  const gradient = `conic-gradient(from ${anchor}deg, ${colorFrom}, ${colorTo}, ${colorFrom})`;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-xl",
        className,
      )}
      style={{
        padding: borderWidth,
        maskImage: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        maskComposite: "exclude" as any,
        WebkitMaskComposite: "xor" as any,
      }}
    >
      <div
        className="h-full w-full rounded-[inherit]"
        style={{
          background: gradient,
          filter: "blur(0.5px)",
          animation: `lf-border-beam ${duration}s linear infinite`,
        }}
      />
      <style>{`
        @keyframes lf-border-beam {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

