import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type RatingStarsProps = {
  value: number;
  max?: number;
  size?: "sm" | "md";
  /** 自定义可访问名称；默认 `${value}/${max} 星`。 */
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
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span
      role="img"
      aria-label={label ?? `${value}/${max} 星`}
      className={cn("inline-flex items-center gap-0.5 text-amber-500", className)}
    >
      {Array.from({ length: filled }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={size === "sm" ? "h-3 w-3 fill-current" : "h-4 w-4 fill-current"}
        />
      ))}
    </span>
  );
}
