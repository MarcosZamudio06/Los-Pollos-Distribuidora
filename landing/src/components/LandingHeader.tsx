import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LANDING_CONFIG, LANDING_BRAND, LANDING_NAV_ITEMS } from "../config/landingConfig";

export function LandingHeader() {
  const [isCompact, setIsCompact] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("#landing-top");

  useEffect(() => {
    const handleScroll = () => setIsCompact(window.scrollY > 18);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const sections = LANDING_NAV_ITEMS.map((item) =>
      document.querySelector<HTMLElement>(item.href),
    ).filter((section): section is HTMLElement => Boolean(section));
    if (sections.length === 0 || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(`#${visible.target.id}`);
      },
      { rootMargin: "-30% 0px -55%", threshold: [0.05, 0.25, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header
      className={`landing-header${isCompact ? " landing-header--compact" : ""}`}
    >
      <div className="landing-container landing-header__inner">
        <a className="landing-wordmark" href="#landing-top" onClick={closeMenu}>
          <span aria-hidden="true" className="landing-wordmark__mark">
            <span />
            <span />
            <span />
          </span>
          <span className="landing-wordmark__name">{LANDING_BRAND.productName}</span>
          <span className="landing-wordmark__descriptor">
            {LANDING_BRAND.descriptor}
          </span>
        </a>

        <nav aria-label="Navegación principal" className="landing-header__nav">
          {LANDING_NAV_ITEMS.map((item) => (
            <a
              aria-current={activeSection === item.href ? "location" : undefined}
              className={activeSection === item.href ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landing-header__actions">
          <a className="landing-header__login" href={LANDING_CONFIG.erpLoginUrl}>
            Iniciar sesión
          </a>
          <a className="landing-button landing-button--small" href="#demo">
            Solicitar demostración
          </a>
          <button
            aria-controls="landing-mobile-menu"
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            className="landing-menu-button"
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <span aria-hidden="true" className="landing-header__progress" data-scroll-progress />

      {isMenuOpen && (
        <div className="landing-mobile-menu" id="landing-mobile-menu">
          <nav aria-label="Navegación móvil">
            {LANDING_NAV_ITEMS.map((item) => (
              <a href={item.href} key={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
            <a href={LANDING_CONFIG.erpLoginUrl} onClick={closeMenu}>
              Iniciar sesión
            </a>
            <a className="landing-button landing-button--dark" href="#demo" onClick={closeMenu}>
              Solicitar demostración
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
