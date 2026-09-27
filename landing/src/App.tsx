import { useEffect, useState } from "react";
import { BillingSection } from "./components/BillingSection";
import { DriverSection } from "./components/DriverSection";
import { FaqSection } from "./components/FaqSection";
import { FinanceSection } from "./components/FinanceSection";
import { FinalCta } from "./components/FinalCta";
import { HeroSection } from "./components/HeroSection";
import { InventorySection } from "./components/InventorySection";
import { LandingFooter } from "./components/LandingFooter";
import { LandingHeader } from "./components/LandingHeader";
import { LogisticsSection } from "./components/LogisticsSection";
import { MultiCompanySection } from "./components/MultiCompanySection";
import { PlatformOverview } from "./components/PlatformOverview";
import { PlansSection } from "./components/PlansSection";
import { PosSection } from "./components/PosSection";
import { SecuritySection } from "./components/SecuritySection";
import { LANDING_SEO } from "./config/landingConfig";
import "./styles/landing.css";
import { LandingMotionShell } from "./components/LandingMotionShell";

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
      LANDING_SEO.canonicalUrl || window.location.origin;
    const previousCanonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const canonical = previousCanonical ?? document.createElement("link");
    const previousCanonicalHref = previousCanonical?.getAttribute("href") ?? null;

    document.title = LANDING_SEO.title;
    document.documentElement.lang = "es";
    canonical.rel = "canonical";
    canonical.href = canonicalUrl;
    if (!previousCanonical) document.head.appendChild(canonical);

    const cleanups = [
      upsertMeta("name", "description", LANDING_SEO.description),
      upsertMeta("property", "og:title", LANDING_SEO.title),
      upsertMeta("property", "og:description", LANDING_SEO.description),
      upsertMeta("property", "og:type", "website"),
      upsertMeta("property", "og:url", canonicalUrl),
      upsertMeta("name", "twitter:card", "summary"),
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
  const [selectedPlan, setSelectedPlan] = useState("");
  useLandingSeo();

  return (
    <LandingMotionShell>
      <div className="landing-page">
        <LandingHeader />
        <main>
          <HeroSection />
          <PlatformOverview />
          <PosSection />
          <InventorySection />
          <LogisticsSection />
          <DriverSection />
          <FinanceSection />
          <BillingSection />
          <MultiCompanySection />
          <SecuritySection />
          <PlansSection onSelectPlan={setSelectedPlan} />
          <FaqSection />
          <FinalCta initialInterest={selectedPlan} />
        </main>
        <LandingFooter />
      </div>
    </LandingMotionShell>
  );
}
