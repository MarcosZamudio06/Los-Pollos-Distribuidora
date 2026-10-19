import { useEffect } from "react";
import { FaqSection } from "./components/FaqSection";
import { FinalCta } from "./components/FinalCta";
import { HeroSection } from "./components/HeroSection";
import { LandingFooter } from "./components/LandingFooter";
import { LandingHeader } from "./components/LandingHeader";
import { LogisticsSection } from "./components/LogisticsSection";
import { ProductGallery } from "./components/ProductGallery";
import { getCommercialConfig } from "./config/commercialConfig";
import { ProductDemoVideo } from "./components/ProductDemoVideo";
import { CompanySection } from "./components/CompanySection";
import { SecuritySection } from "./components/SecuritySection";
import { WorkflowSection } from "./components/WorkflowSection";
import { LandingMotionShell } from "./components/LandingMotionShell";
import { LANDING_SEO } from "./config/landingConfig";
import "./styles/landing.css";
import s from "./styles/landing.module.css";

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
) {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const element = existing ?? document.createElement("meta");
  const previousContent = existing?.getAttribute("content") ?? null;

  if (!existing) {
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);

  return () => {
    if (existing && previousContent !== null) {
      existing.setAttribute("content", previousContent);
    } else if (!existing) {
      element.remove();
    }
  };
}

function useLandingSeo() {
  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    const canonicalUrl =
      LANDING_SEO.canonicalUrl;
    const previousCanonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const canonical = previousCanonical ?? document.createElement("link");
    const previousCanonicalHref = previousCanonical?.getAttribute("href") ?? null;

    document.title = LANDING_SEO.title;
    document.documentElement.lang = "es";
    canonical.rel = "canonical";
    canonical.href = canonicalUrl;
    if (canonicalUrl && !previousCanonical) document.head.appendChild(canonical);

    const cleanups = [
      upsertMeta("name", "description", LANDING_SEO.description),
      upsertMeta("property", "og:title", LANDING_SEO.title),
      upsertMeta("property", "og:description", LANDING_SEO.description),
      upsertMeta("property", "og:type", "website"),
      ...(canonicalUrl ? [upsertMeta("property", "og:url", canonicalUrl)] : []),
      upsertMeta("name", "twitter:card", getCommercialConfig().socialImage ? "summary_large_image" : "summary"),
      ...(getCommercialConfig().socialImage ? [upsertMeta("property", "og:image", getCommercialConfig().socialImage), upsertMeta("name", "twitter:image", getCommercialConfig().socialImage), upsertMeta("property", "og:image:alt", LANDING_SEO.imageAlt)] : []),
    ];

    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
      cleanups.forEach((cleanup) => cleanup());
      if (previousCanonical && previousCanonicalHref !== null) {
        previousCanonical.href = previousCanonicalHref;
      } else if (!previousCanonical) {
        canonical.remove();
      }
    };
  }, []);
}

export function App() {
  useLandingSeo();
  return (
    <LandingMotionShell>
      <div id="landing-top" className={s.page}>
        <a href="#main-content" className={s.skipLink}>Saltar al contenido</a>
        <LandingHeader />
        <main id="main-content" tabIndex={-1}>
          <HeroSection />
          <ProductGallery />
          <ProductDemoVideo />
          <WorkflowSection />
          <LogisticsSection />
          <CompanySection />
          <SecuritySection />
          <FaqSection />
          <FinalCta />
        </main>
        <LandingFooter />
      </div>
    </LandingMotionShell>
  );
}
