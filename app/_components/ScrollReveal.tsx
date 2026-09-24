"use client";

import { useEffect } from "react";

/**
 * Fades elements marked `data-reveal` in once as they scroll into view.
 * Progressive enhancement: content is only hidden after this runs (it adds
 * `reveal-ready` to <html>), so without JS everything is simply visible.
 * Honours prefers-reduced-motion by doing nothing.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const root = document.documentElement;
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target); // animate once, never replay
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );

    // Anything already on screen is shown straight away, so nothing flickers.
    const viewportBottom = window.innerHeight;
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top < viewportBottom * 0.9) el.classList.add("is-visible");
      else observer.observe(el);
    });
    root.classList.add("reveal-ready");

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}
