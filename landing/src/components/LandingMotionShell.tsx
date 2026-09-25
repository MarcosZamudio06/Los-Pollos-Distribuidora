import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, useLenis } from "lenis/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

gsap.registerPlugin(ScrollTrigger, useGSAP);

type LandingMotionShellProps = {
  children: ReactNode;
};

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change", update);

    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  return reducedMotion;
}

function pathLength(path: SVGPathElement) {
  return typeof path.getTotalLength === "function" ? path.getTotalLength() : 900;
}

function prepareSignal(path: SVGPathElement) {
  const length = pathLength(path);
  gsap.set(path, {
    strokeDasharray: `${length} ${length + 2}`,
    strokeDashoffset: length,
  });
  return length;
}

function stickyHeaderOffset(root: HTMLElement, breathingRoom = 20) {
  const header = root.querySelector<HTMLElement>(".landing-header");
  return Math.ceil(header?.getBoundingClientRect().height ?? 76) + breathingRoom;
}

function viewportDistance(multiplier: number, minimum: number) {
  return Math.round(Math.max(window.innerHeight * multiplier, minimum));
}

function LenisScrollBridge() {
  const lenis = useLenis(() => ScrollTrigger.update());

  useEffect(() => {
    if (!lenis) return;

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, [lenis]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) ScrollTrigger.refresh();
    };
    const frame = window.requestAnimationFrame(refresh);
    void document.fonts?.ready.then(refresh);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

export function LandingMotionShell({ children }: LandingMotionShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reducedMotion) return;

      root.classList.add("landing-motion-ready");
      const media = gsap.matchMedia();

      const scrollProgress = root.querySelector<HTMLElement>("[data-scroll-progress]");
      if (scrollProgress) {
        gsap.set(scrollProgress, { scaleX: 0 });
        gsap.to(scrollProgress, {
          scrollTrigger: { start: 0, end: "max", scrub: true },
          scaleX: 1,
          ease: "none",
        });
      }

      media.add("(min-width: 900px)", () => {
        const hero = root.querySelector<HTMLElement>("[data-hero]");
        if (hero) {
          const eyebrow = hero.querySelector<HTMLElement>("[data-hero-eyebrow]");
          const lines = Array.from(hero.querySelectorAll<HTMLElement>("[data-hero-line]"));
          const lede = hero.querySelector<HTMLElement>("[data-hero-lede]");
          const visual = hero.querySelector<HTMLElement>("[data-hero-visual]");
          const visualSurface = visual?.querySelector<HTMLElement>(".landing-hero__screen");
          const signal = hero.querySelector<SVGPathElement>("[data-hero-signal-path]");

          const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
          intro
            .from(eyebrow, { autoAlpha: 0, x: -18, duration: 0.45 })
            .from(
              lines,
              {
                autoAlpha: 0,
                clipPath: "inset(0 0 100% 0)",
                duration: 0.8,
                stagger: 0.12,
              },
              "-=0.1",
            )
            .from(lede, { autoAlpha: 0, y: 18, duration: 0.55 }, "-=0.25")
            .from(visual, { autoAlpha: 0, duration: 0.7 }, "-=0.35");

          if (visualSurface) {
            intro.from(visualSurface, { y: 42, rotateX: 4, duration: 1 }, "<");
          }

          if (signal) {
            prepareSignal(signal);
            gsap.to(signal, {
              scrollTrigger: {
                trigger: hero,
                start: "top top",
                end: "bottom 70%",
                scrub: 1,
              },
              strokeDashoffset: 0,
              ease: "none",
            });
            gsap.to(hero.querySelector("[data-hero-pulse]"), {
              opacity: 0.32,
              repeat: -1,
              yoyo: true,
              duration: 1.5,
              ease: "sine.inOut",
            });
          }
        }

        const platform = root.querySelector<HTMLElement>("[data-platform-sequence]");
        const platformStage = platform?.querySelector<HTMLElement>("[data-platform-stage]");
        const platformPanels = platform
          ? Array.from(platform.querySelectorAll<HTMLElement>("[data-platform-panel]"))
          : [];
        const platformSteps = platform
          ? Array.from(platform.querySelectorAll<HTMLElement>("[data-platform-step]"))
          : [];

        if (platform && platformStage && platformPanels.length > 1) {
          gsap.set(platformPanels, { autoAlpha: 0, y: 24 });
          gsap.set(platformPanels[0], { autoAlpha: 1, y: 0 });
          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: platformStage,
              start: () => `top top+=${stickyHeaderOffset(root)}`,
              end: () => `+=${viewportDistance(1.62, platformPanels.length * 290)}`,
              pin: platformStage,
              pinSpacing: true,
              scrub: 1,
              anticipatePin: 1,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                const activeIndex = Math.min(
                  platformPanels.length - 1,
                  Math.floor(self.progress * platformPanels.length + 0.001),
                );
                platformSteps.forEach((step, index) => {
                  step.classList.toggle("is-active", index === activeIndex);
                  step.setAttribute("aria-current", index === activeIndex ? "step" : "false");
                });
              },
            },
          });

          platformPanels.slice(1).forEach((panel, index) => {
            const label = `platform-${index + 1}`;
            timeline
              .addLabel(label, index + 0.8)
              .to(
                platformPanels[index],
                { autoAlpha: 0, y: -12, duration: 0.3, ease: "power2.in" },
                label,
              )
              .fromTo(
                panel,
                { autoAlpha: 0, y: 12 },
                { autoAlpha: 1, y: 0, duration: 0.38, ease: "power2.out", immediateRender: false },
                `${label}+=0.34`,
              );
          });
        }

        const journey = root.querySelector<HTMLElement>("[data-signal-journey]");
        const journeyRail = journey?.querySelector<HTMLElement>("[data-signal-journey-rail]");
        const journeyPath = journey?.querySelector<SVGPathElement>("[data-signal-journey-path]");
        const journeyNodes = journey
          ? Array.from(journey.querySelectorAll<HTMLElement>("[data-journey-node]"))
          : [];
        if (journeyRail && journeyPath) {
          const length = prepareSignal(journeyPath);
          ScrollTrigger.create({
            trigger: journeyRail,
            start: () => `top top+=${stickyHeaderOffset(root, 28)}`,
            end: () => `+=${viewportDistance(0.64, 620)}`,
            pin: journeyRail,
            pinSpacing: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              gsap.set(journeyPath, { strokeDashoffset: length * (1 - self.progress) });
              const activeIndex = Math.min(
                journeyNodes.length - 1,
                Math.floor(self.progress * journeyNodes.length + 0.001),
              );
              journeyNodes.forEach((node, index) => node.classList.toggle("is-active", index <= activeIndex));
            },
          });
        }

        const route = root.querySelector<HTMLElement>("[data-route-sequence]");
        const routeMap = route?.querySelector<HTMLElement>("[data-route-map]");
        const routePath = route?.querySelector<SVGPathElement>("[data-route-path]");
        const routeCheckpoints = route
          ? Array.from(route.querySelectorAll<HTMLElement>("[data-route-checkpoint]"))
          : [];
        const routeScreens = route
          ? Array.from(route.querySelectorAll<HTMLElement>(".landing-route-shot__media"))
          : [];
        if (routeMap && routePath) {
          const length = prepareSignal(routePath);
          ScrollTrigger.create({
            trigger: routeMap,
            start: () => `top top+=${stickyHeaderOffset(root, 20)}`,
            end: () => `+=${viewportDistance(0.76, 740)}`,
            pin: routeMap,
            pinSpacing: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              gsap.set(routePath, { strokeDashoffset: length * (1 - self.progress) });
              const activeIndex = Math.min(
                routeCheckpoints.length - 1,
                Math.floor(self.progress * routeCheckpoints.length + 0.001),
              );
               routeCheckpoints.forEach((checkpoint, index) => {
                 checkpoint.classList.toggle("is-active", index <= activeIndex);
               });
               routeScreens.forEach((screen, index) => {
                 const screenProgress = Math.max(0, Math.min(1, self.progress * routeScreens.length - index));
                 gsap.set(screen, {
                   autoAlpha: 0.82 + screenProgress * 0.18,
                   scale: 0.985 + screenProgress * 0.015,
                   y: (1 - screenProgress) * 8,
                 });
               });
             },
           });
        }

        const isolation = root.querySelector<HTMLElement>("[data-isolation-sequence]");
        if (isolation) {
          const trunk = isolation.querySelector<SVGPathElement>("[data-isolation-trunk]");
          const branches = Array.from(
            isolation.querySelectorAll<SVGPathElement>("[data-isolation-branch]"),
          );
          const originMark = isolation.querySelector<HTMLElement>("[data-isolation-origin] .landing-isolation-sequence__origin-mark");
          const planes = Array.from(isolation.querySelectorAll<HTMLElement>("[data-company-plane]"));
          const layers = Array.from(isolation.querySelectorAll<HTMLElement>("[data-company-layer]"));
          if (trunk && branches.length > 0) {
            prepareSignal(trunk);
            branches.forEach(prepareSignal);
            const isolationTimeline = gsap.timeline({
              scrollTrigger: {
                trigger: isolation,
                start: "top 72%",
                end: "bottom 48%",
                scrub: 0.8,
              },
            });
            isolationTimeline
              .to(trunk, { strokeDashoffset: 0, duration: 0.3, ease: "none" });
            if (originMark) {
              isolationTimeline
                .to(originMark, { scale: 1.08, duration: 0.12, ease: "power1.out" })
                .to(originMark, { scale: 1, duration: 0.12, ease: "power1.in" });
            }
            isolationTimeline
              .to(branches, { strokeDashoffset: 0, duration: 0.42, ease: "none" })
              .fromTo(
                planes,
                { autoAlpha: 0, y: 22, scale: 0.97 },
                { autoAlpha: 1, y: 0, scale: 1, duration: 0.34, stagger: 0.08 },
                "-=0.12",
              )
              .fromTo(
                layers,
                { autoAlpha: 0, y: 8 },
                { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.025 },
                "-=0.18",
              );
          }
        }
      });

      const finance = root.querySelector<HTMLElement>("[data-finance-flow]");
      if (finance) {
        const transitionSurface = finance.querySelector<HTMLElement>("[data-finance-transition-surface]");
        const transitionPath = finance.querySelector<SVGPathElement>("[data-finance-transition-path]");
        const exitSurface = finance.querySelector<HTMLElement>("[data-finance-exit-surface]");
        const exitPath = finance.querySelector<SVGPathElement>("[data-finance-exit-path]");
        const financeContent = finance.querySelector<HTMLElement>("[data-finance-content]");
        const financeSteps = finance.querySelector<HTMLElement>(".landing-finance-steps");
        const steps = Array.from(finance.querySelectorAll<HTMLElement>("[data-finance-step]"));
        const financeRows = Array.from(finance.querySelectorAll<HTMLElement>("[data-finance-row]"));

        if (transitionSurface && transitionPath && financeContent) {
          prepareSignal(transitionPath);
          gsap.set(transitionSurface, { clipPath: "circle(0% at 50% 0%)" });
          gsap.set(financeContent, { autoAlpha: 0, y: 16 });
          gsap.timeline({
            scrollTrigger: {
              trigger: finance,
              start: "top 94%",
              end: "top 24%",
              scrub: 0.7,
              invalidateOnRefresh: true,
            },
          })
            .to(transitionPath, { strokeDashoffset: 0, duration: 0.42, ease: "none" }, 0)
            .to(
              transitionSurface,
              { clipPath: "circle(150% at 50% 0%)", duration: 0.78, ease: "none" },
              0.08,
            )
            .to(financeContent, { autoAlpha: 1, y: 0, duration: 0.3 }, 0.68);
        }

        if (exitSurface && exitPath) {
          prepareSignal(exitPath);
          gsap.set(exitSurface, { clipPath: "circle(0% at 50% 100%)" });
          gsap.timeline({
            scrollTrigger: {
              trigger: finance,
              start: "bottom 88%",
              end: "bottom 34%",
              scrub: 0.7,
              invalidateOnRefresh: true,
            },
          })
            .to(exitPath, { strokeDashoffset: 0, duration: 0.4, ease: "none" })
            .to(
              exitSurface,
              { clipPath: "circle(170% at 50% 100%)", duration: 0.72, ease: "none" },
              0.08,
            );
        }

        ScrollTrigger.create({
          trigger: finance,
          start: "top 58%",
          end: "bottom 52%",
          scrub: 0.65,
          onUpdate: (self) => {
            financeSteps?.style.setProperty("--finance-progress", self.progress.toString());
            const activeIndex = Math.min(
              steps.length - 1,
              Math.floor(self.progress * steps.length + 0.001),
            );
            steps.forEach((step, index) => step.classList.toggle("is-active", index <= activeIndex));
            financeRows.forEach((row, index) => row.classList.toggle("is-active", index <= activeIndex));
          },
        });
      }

      media.add("(max-width: 899px)", () => {
        const hero = root.querySelector<HTMLElement>("[data-hero]");
        const signal = hero?.querySelector<SVGPathElement>("[data-hero-signal-path]");
        if (signal && hero) {
          prepareSignal(signal);
          gsap.to(signal, {
            scrollTrigger: { trigger: hero, start: "top 70%", end: "bottom 70%", scrub: 1 },
            strokeDashoffset: 0,
            ease: "none",
          });
        }

        const journey = root.querySelector<HTMLElement>("[data-signal-journey]");
        const journeyPath = journey?.querySelector<SVGPathElement>("[data-signal-journey-path]");
        const journeyNodes = journey
          ? Array.from(journey.querySelectorAll<HTMLElement>("[data-journey-node]"))
          : [];
        if (journey && journeyPath) {
          const length = prepareSignal(journeyPath);
          ScrollTrigger.create({
            trigger: journey,
            start: "top 76%",
            end: "center 38%",
            scrub: 1,
            onUpdate: (self) => {
              gsap.set(journeyPath, { strokeDashoffset: length * (1 - self.progress) });
              const activeIndex = Math.min(
                journeyNodes.length - 1,
                Math.floor(self.progress * journeyNodes.length + 0.001),
              );
              journeyNodes.forEach((node, index) => node.classList.toggle("is-active", index <= activeIndex));
            },
          });
        }

        const route = root.querySelector<HTMLElement>("[data-route-sequence]");
        const routePath = route?.querySelector<SVGPathElement>("[data-route-path]");
        const routeCheckpoints = route
          ? Array.from(route.querySelectorAll<HTMLElement>("[data-route-checkpoint]"))
          : [];
        const routeScreens = route
          ? Array.from(route.querySelectorAll<HTMLElement>(".landing-route-shot__media"))
          : [];
        if (route && routePath) {
          const length = prepareSignal(routePath);
          ScrollTrigger.create({
            trigger: route,
            start: "top 76%",
            end: "center 34%",
            scrub: 1,
            onUpdate: (self) => {
              gsap.set(routePath, { strokeDashoffset: length * (1 - self.progress) });
              const activeIndex = Math.min(
                routeCheckpoints.length - 1,
                Math.floor(self.progress * routeCheckpoints.length + 0.001),
              );
               routeCheckpoints.forEach((checkpoint, index) => {
                 checkpoint.classList.toggle("is-active", index <= activeIndex);
               });
               routeScreens.forEach((screen, index) => {
                 const screenProgress = Math.max(0, Math.min(1, self.progress * routeScreens.length - index));
                 gsap.set(screen, {
                   autoAlpha: 0.82 + screenProgress * 0.18,
                   scale: 0.985 + screenProgress * 0.015,
                   y: (1 - screenProgress) * 8,
                 });
               });
             },
           });
        }
      });

      const ctaPath = root.querySelector<SVGPathElement>("[data-cta-signal-path]");
      const cta = root.querySelector<HTMLElement>("[data-final-cta]");
      if (ctaPath && cta) {
        prepareSignal(ctaPath);
        gsap.to(ctaPath, {
          scrollTrigger: { trigger: cta, start: "top 78%", end: "center 55%", scrub: 1 },
          strokeDashoffset: 0,
          ease: "none",
        });
      }

      const refresh = () => ScrollTrigger.refresh();
      const pendingImages = Array.from(root.querySelectorAll<HTMLImageElement>("img")).filter(
        (image) => !image.complete,
      );
      pendingImages.forEach((image) => {
        image.addEventListener("load", refresh, { once: true });
        image.addEventListener("error", refresh, { once: true });
      });

      let viewportWidth = window.innerWidth;
      let viewportHeight = window.innerHeight;
      const refreshAfterMeaningfulResize = () => {
        const widthDelta = Math.abs(window.innerWidth - viewportWidth);
        const heightDelta = Math.abs(window.innerHeight - viewportHeight);
        if (widthDelta < 48 && heightDelta < 80) return;
        viewportWidth = window.innerWidth;
        viewportHeight = window.innerHeight;
        refresh();
      };

      window.addEventListener("resize", refreshAfterMeaningfulResize, { passive: true });
      window.addEventListener("orientationchange", refresh, { passive: true });

      return () => {
        pendingImages.forEach((image) => {
          image.removeEventListener("load", refresh);
          image.removeEventListener("error", refresh);
        });
        window.removeEventListener("resize", refreshAfterMeaningfulResize);
        window.removeEventListener("orientationchange", refresh);
        root.classList.remove("landing-motion-ready");
        media.revert();
      };
    },
    { dependencies: [reducedMotion], revertOnUpdate: true, scope: rootRef },
  );

  const content = reducedMotion ? (
    children
  ) : (
      <ReactLenis
        options={{
          autoRaf: false,
          smoothWheel: true,
          lerp: 0.08,
          wheelMultiplier: 0.9,
        }}
        root
      >
      <LenisScrollBridge />
      {children}
    </ReactLenis>
  );

  return (
    <div className="landing-motion-shell" ref={rootRef}>
      {content}
    </div>
  );
}
