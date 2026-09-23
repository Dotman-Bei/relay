"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * Staggered rise that starts when the group scrolls into view (frontend.md §7 fix: staggers below
 * the fold otherwise finish before anyone sees them). Server render is fully visible.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "pending" | "shown">("static");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already visible: no animation needed
    setState("pending");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} data-reveal={state} className={cx("neo-stagger", className)}>
      {children}
    </div>
  );
}
