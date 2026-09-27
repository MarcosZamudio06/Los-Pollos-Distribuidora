import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
} from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function LandingReveal({
  children,
  className,
  delay = 0,
}: RevealProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 18 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] }
      }
      viewport={{ amount: 0.18, once: true }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
}

type LandingMagneticProps = {
  children: ReactNode;
  className?: string;
  href: string;
};

export function LandingMagnetic({
  children,
  className,
  href,
}: LandingMagneticProps) {
  const reducedMotion = useReducedMotion();
  const x = useSpring(useMotionValue(0), { damping: 28, stiffness: 260, mass: 0.35 });
  const y = useSpring(useMotionValue(0), { damping: 28, stiffness: 260, mass: 0.35 });

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLAnchorElement>) => {
      if (
        reducedMotion ||
        event.pointerType === "touch" ||
        !window.matchMedia("(hover: hover) and (pointer: fine)").matches
      ) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 10;
      const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 10;
      x.set(offsetX);
      y.set(offsetY);
    },
    [reducedMotion, x, y],
  );

  const handlePointerLeave = useCallback(
    () => {
      x.set(0);
      y.set(0);
    },
    [x, y],
  );

  return (
    <motion.a
      className={className}
      href={href}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={{ x: reducedMotion ? 0 : x, y: reducedMotion ? 0 : y }}
    >
      {children}
    </motion.a>
  );
}

type LandingPointerFrameProps = {
  children: ReactNode;
  className?: string;
  [key: `data-${string}`]: string | undefined;
};

export function LandingPointerFrame({
  children,
  className,
  ...dataProps
}: LandingPointerFrameProps) {
  const reducedMotion = useReducedMotion();
  const rotateX = useSpring(useMotionValue(0), { damping: 24, stiffness: 180, mass: 0.5 });
  const rotateY = useSpring(useMotionValue(0), { damping: 24, stiffness: 180, mass: 0.5 });

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      reducedMotion ||
      event.pointerType === "touch" ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5;
    rotateX.set(normalizedY * -3);
    rotateY.set(normalizedX * 4);
  };

  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      {...dataProps}
      className={className}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={{ perspective: 1400, rotateX: reducedMotion ? 0 : rotateX, rotateY: reducedMotion ? 0 : rotateY }}
    >
      {children}
    </motion.div>
  );
}

type LandingSectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
  id?: string;
};

export function LandingSectionHeading({
  align = "left",
  description,
  eyebrow,
  title,
  id,
}: LandingSectionHeadingProps) {
  return (
    <div className={`landing-section-heading landing-section-heading--${align}`}>
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      <p className="landing-section-heading__description">{description}</p>
    </div>
  );
}
