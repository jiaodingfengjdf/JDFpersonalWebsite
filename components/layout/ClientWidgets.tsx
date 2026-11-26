"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useDeferredActivation } from "@/lib/useDeferredActivation";

const CommandPalette = dynamic(() => import("@/components/ui/CommandPalette"), { ssr: false });
const FloatingPlayer = dynamic(() => import("@/components/music/FloatingPlayer"), { ssr: false });
const Live2D = dynamic(() => import("@/components/widgets/Live2D"), { ssr: false });
const Toolbox = dynamic(() => import("@/components/widgets/Toolbox"), { ssr: false });
const GamesPanel = dynamic(() => import("@/components/widgets/GamesPanel"), { ssr: false });

export default function ClientWidgets() {
  const pathname = usePathname();
  const active = useDeferredActivation();

  if (pathname.startsWith("/garden")) return null;

  return (
    <>
      <CommandPalette />
      {active && (
        <>
          {pathname !== "/music" && <FloatingPlayer />}
          <Live2D />
          <Toolbox />
          <GamesPanel />
        </>
      )}
    </>
  );
}
