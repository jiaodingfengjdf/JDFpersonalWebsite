import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type RatingStarsProps = {
  value: number | null | undefined;
  max?: number;
  size?: "sm" | "md";
  /** 自定义可访问名称；默认 `${filled} / ${max} 星`。 */
  label?: string;
  className?: string;
};

export default function RatingStars({
  value,
  max = 5,
  size = "md",
  label,
  className,
}: RatingStarsProps) {
  const safeMax = Math.max(1, Math.round(max));
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const filled = Math.max(0, Math.min(safeMax, Math.round(numeric)));
  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <span
      role="img"
      aria-label={label ?? `${filled} / ${safeMax} 星`}
      className={cn("inline-flex items-center gap-0.5 align-middle", className)}
    >
      {Array.from({ length: safeMax }, (_, index) => {
        const isFilled = index < filled;
        return (
          <Star
            key={index}
            aria-hidden="true"
            className={cn(
              sizeClass,
              isFilled
                ? "fill-current text-amber-500 dark:text-amber-400"
                : "text-slate-300/70 dark:text-slate-600/70",
            )}
          />
        );
      })}
    </span>
  );
}
