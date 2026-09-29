import { useEffect, useState } from "react";

export const AUTH_SLIDES = [
  { src: "/auth/staff-1.webp", caption: "Market traders", position: "55% 35%" },
  { src: "/auth/staff-2.webp", caption: "Shop owners", position: "50% 30%" },
  { src: "/auth/staff-3.webp", caption: "Fresh produce sellers", position: "40% 30%" },
  { src: "/auth/staff-4.webp", caption: "Everyday retail", position: "45% 30%" },
];
export const AUTH_SLIDE_MS = 7000;

// The slideshow position is shared by every auth screen so the caption and
// progress bars on the page stay in step with the photo behind them.
let activeSlide = 0;
const listeners = new Set<(index: number) => void>();

export function showAuthSlide(index: number) {
  activeSlide = ((index % AUTH_SLIDES.length) + AUTH_SLIDES.length) % AUTH_SLIDES.length;
  listeners.forEach((notify) => notify(activeSlide));
}

export function useAuthSlide() {
  const [index, setIndex] = useState(activeSlide);
  useEffect(() => {
    listeners.add(setIndex);
    return () => { listeners.delete(setIndex); };
  }, []);
  return index;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Full-bleed crossfading photos behind the landing, sign-in and sign-up screens.
 * Mounted once by the app shell so it keeps playing while those screens swap.
 */
export function PhotoBackdrop() {
  const active = useAuthSlide();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => showAuthSlide(active + 1), AUTH_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [active, reduced]);

  return (
    <div className="kx-backdrop" aria-hidden="true">
      {AUTH_SLIDES.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          alt=""
          decoding="async"
          loading={i === active ? "eager" : "lazy"}
          className={`kx-backdrop__photo${i === active ? " is-active" : ""}`}
          style={{ objectPosition: slide.position }}
        />
      ))}
      <div className="kx-backdrop__scrim" />
    </div>
  );
}

/** Caption plus progress bars for the current photo; clicking a bar jumps to it. */
export function SlideIndicator() {
  const active = useAuthSlide();
  return (
    <div className="kx-slides">
      <span key={active} className="kx-slides__caption">{AUTH_SLIDES[active].caption}</span>
      <div className="kx-slides__bars">
        {AUTH_SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Show photo ${i + 1}`}
            className={`kx-slides__bar${i === active ? " is-active" : ""}`}
            onClick={() => showAuthSlide(i)}
          >
            <span key={i === active ? `on-${active}` : "off"} style={{ animationDuration: `${AUTH_SLIDE_MS}ms` }} />
          </button>
        ))}
      </div>
    </div>
  );
}
