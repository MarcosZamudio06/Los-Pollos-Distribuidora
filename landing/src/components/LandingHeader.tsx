import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LANDING_BRAND, LANDING_NAV_ITEMS } from "../config/landingConfig";
import { getCommercialAction, getCommercialConfig } from "../config/commercialConfig";
import s from "../styles/landing.module.css";

export function LandingHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { href: demoHref, label: demoLabel } = getCommercialAction();
  const { loginUrl } = getCommercialConfig();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setIsMenuOpen(false);
    };
    const desktop = window.matchMedia?.("(min-width: 1280px)");
    const close = () => setIsMenuOpen(false);
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", outside);
    desktop?.addEventListener("change", close);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", outside);
      desktop?.removeEventListener("change", close);
    };
  }, [isMenuOpen]);

  return (
    <header className={s.header} data-landing-header ref={headerRef}>
      <div className={`${s.container} ${s.headerInner}`}>
        <a className={s.brand} href="#landing-top" onClick={() => setIsMenuOpen(false)}>
          <span aria-hidden="true" className={s.brandMark}><i /><i /><i /></span>
          <span>{LANDING_BRAND.productName}</span>
        </a>
        <nav aria-label="Navegación principal" className={s.desktopNav}>
          {LANDING_NAV_ITEMS.map(item => <a href={item.href} key={item.href}>{item.label}</a>)}
        </nav>
        <a className={`${s.button} ${s.primary} ${s.headerDemo}`} href={demoHref}>{demoLabel}</a>
        {loginUrl && <a className={s.headerLogin} href={loginUrl}>Acceso clientes</a>}
        <button ref={toggleRef} aria-controls="landing-mobile-menu" aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"} className={s.menuButton}
          onClick={() => setIsMenuOpen(open => !open)} type="button">
          <span>Menú</span>{isMenuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
        </button>
      </div>
      {isMenuOpen && <nav aria-label="Navegación móvil" className={`${s.container} ${s.mobileNav}`} id="landing-mobile-menu">
        <a className={`${s.button} ${s.primary}`} href={demoHref} onClick={() => setIsMenuOpen(false)}>{demoLabel}</a>
        {LANDING_NAV_ITEMS.map(item => <a href={item.href} key={item.href} onClick={() => setIsMenuOpen(false)}>{item.label}</a>)}
        {loginUrl && <a className={s.mobileAccessLink} href={loginUrl}>Acceso clientes</a>}
      </nav>}
    </header>
  );
}
