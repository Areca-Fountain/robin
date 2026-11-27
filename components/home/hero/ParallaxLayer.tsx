"use client";

import { useEffect, useRef } from "react";

/**
 * Moves its children at a different speed than the page while the hero is scrolled.
 *
 *  speed  - 0 = moves with the page, 0.5 = lags behind at half speed (looks far away)
 *  fade   - how fast it fades out (1 = fully gone when the hero has scrolled away)
 *  grow   - extra scale gained over the hero (0.08 = +8%)
 *
 * Uses requestAnimationFrame easing so movement stays smooth even with a
 * notchy mouse wheel. Skipped completely for "reduce motion" users.
 */
export default function ParallaxLayer({
  children,
  className,
  speed = 0.2,
  fade = 0,
  grow = 0,
  origin = "center",
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  fade?: number;
  grow?: number;
  origin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = el.closest<HTMLElement>("[data-parallax-root]") ?? el.parentElement;
    let heroH = root?.offsetHeight || window.innerHeight;
    let target = 0;
    let current = 0;
    let raf = 0;
    let running = false;

    const apply = () => {
      const p = Math.min(current / heroH, 1);
      el.style.transform = `translate3d(0, ${(current * speed).toFixed(2)}px, 0) scale(${(1 + p * grow).toFixed(4)})`;
      if (fade) el.style.opacity = String(Math.max(0, 1 - p * fade));
    };

    const tick = () => {
      current += (target - current) * 0.12;
      if (Math.abs(target - current) < 0.1) current = target;
      apply();
      if (current !== target) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const onScroll = () => {
      target = Math.min(Math.max(window.scrollY, 0), heroH * 1.2);
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      heroH = root?.offsetHeight || window.innerHeight;
      onScroll();
    };

    onScroll(); // also handles a restored scroll position on reload
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [speed, fade, grow]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ transformOrigin: origin, willChange: "transform" }}
    >
      {children}
    </div>
  );
}
