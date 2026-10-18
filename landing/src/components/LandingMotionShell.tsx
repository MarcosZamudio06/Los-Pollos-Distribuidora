import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function LandingMotionShell({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!root.current || typeof window.matchMedia !== "function") return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const hero = root.current?.querySelector("[data-hero]");
      if (hero) {
        // One short authored entrance. Default markup remains fully visible.
        gsap.fromTo(hero.querySelectorAll("[data-hero-line], [data-hero-lede], [data-hero-visual]"),
          { y: 12, opacity: 0.8 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity" });
      }
      const story = root.current?.querySelector("[data-operation-story]");
      if (story) {
        gsap.fromTo(story.querySelector("ol"), { opacity: 0.7 }, {
          opacity: 1, duration: 0.4, ease: "power3.out", clearProps: "opacity",
          scrollTrigger: { trigger: story, start: "top 85%", once: true },
        });
      }
    });
    return () => media.revert();
  }, { scope: root });
  return <div ref={root}>{children}</div>;
}
