import { LANDING_CONFIG, LANDING_BRAND, LANDING_FOOTER_GROUPS } from "../config/landingConfig";

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="landing-footer__top">
          <div className="landing-footer__brand">
            <a className="landing-wordmark landing-wordmark--footer" href="#landing-top">
              <span aria-hidden="true" className="landing-wordmark__mark">
                <span />
                <span />
                <span />
              </span>
              <span className="landing-wordmark__name">{LANDING_BRAND.productName}</span>
            </a>
            <p>{LANDING_BRAND.tagline}</p>
          </div>

          <nav aria-label="Navegación de pie de página" className="landing-footer__nav">
            {LANDING_FOOTER_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="landing-footer__label">{group.label}</p>
                {group.links.map((link) =>
                  "placeholder" in link && link.placeholder ? (
                    <span className="landing-footer__placeholder" key={link.href} title="Pendiente de configurar">
                      {link.label}
                    </span>
                  ) : (
                    <a href={link.href} key={link.href}>
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            ))}
            <div>
              <p className="landing-footer__label">Acceso</p>
              <a href={LANDING_CONFIG.erpLoginUrl}>Ingresar al ERP</a>
              <a href="#demo">Solicitar demostración</a>
            </div>
          </nav>
        </div>
        <div className="landing-footer__bottom">
          <span>© {new Date().getFullYear()} {LANDING_BRAND.productName}</span>
          <span>Plataforma empresarial configurable</span>
        </div>
      </div>
    </footer>
  );
}
