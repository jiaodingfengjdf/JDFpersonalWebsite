"use client";

import { useEffect } from "react";
import { useDeferredActivation } from "@/lib/useDeferredActivation";

export default function VisitorTracker() {
  const active = useDeferredActivation();

  useEffect(() => {
    if (!active) return;

    // 访客记录
    if (!sessionStorage.getItem("visitor_recorded")) {
      fetch("/api/visitors/record", {
        method: "POST",
        headers: {
          "x-path": window.location.pathname,
        },
      })
        .then(() => {
          sessionStorage.setItem("visitor_recorded", "1");
        })
        .catch(() => {});
    }
  }, [active]);

  return null;
}
