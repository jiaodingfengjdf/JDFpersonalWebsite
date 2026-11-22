"use client";

import { useBackground } from "@/components/providers/BackgroundProvider";

export default function BackgroundRenderer() {
  const { bgImage, bgBlur, useGradient, gradientColors } = useBackground();

  return (
    <div className="fixed inset-0 -z-10 h-lvh">
      {useGradient ? (
        <div
          className="absolute inset-0 gradient-background"
          style={{
            backgroundImage: `linear-gradient(135deg, ${gradientColors.join(", ")})`,
          }}
        />
      ) : (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${bgImage})`,
            }}
          />
          {/* 深色模式遮罩 */}
          <div className="absolute inset-0 bg-transparent dark:bg-black/60 transition-colors duration-500" />
          {bgBlur > 0 && (
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: `blur(${bgBlur}px)`,
                WebkitBackdropFilter: `blur(${bgBlur}px)`,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
