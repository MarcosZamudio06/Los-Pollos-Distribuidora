import { BRAND_SEO } from "./src/config/brand.ts";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import type { HtmlTagDescriptor } from "vite";
import { getPublicSeo } from "./src/services/seoTags.ts";

let publicEnvironment: Record<string, string> = {};
const commercialSeo = {
  name: "landing-commercial-seo",
  configResolved(config: { env: Record<string, string> }) { publicEnvironment = config.env; },
  transformIndexHtml(html: string) {
    const { canonical, socialImage } = getPublicSeo(publicEnvironment.VITE_LANDING_CANONICAL_URL, publicEnvironment.VITE_LANDING_SOCIAL_IMAGE);
    const tags: HtmlTagDescriptor[] = [];
    html = html.replace(/<title>.*?<\/title>/, `<title>${BRAND_SEO.title}</title>`)
      .replace(/(<meta\s+(?:name|property)="(?:og:title|twitter:title)"\s+content=")[^"]*/g, `$1${BRAND_SEO.title}`)
      .replace(/(<meta\s+(?:name|property)="(?:description|og:description|twitter:description)"\s+content=")[^"]*/g, `$1${BRAND_SEO.description}`);
    if (canonical) {
      tags.push({ tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" });
      tags.push({ tag: "meta", attrs: { property: "og:url", content: canonical }, injectTo: "head" });
      tags.push({ tag: "script", attrs: { type: "application/ld+json" }, children: JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: BRAND_SEO.title, url: canonical, inLanguage: "es", description: BRAND_SEO.description }).replace(/</g, "\\u003c"), injectTo: "head" });
    }
    if (socialImage) {
      tags.push({ tag: "meta", attrs: { property: "og:image", content: socialImage }, injectTo: "head" });
      tags.push({ tag: "meta", attrs: { name: "twitter:image", content: socialImage }, injectTo: "head" });
      tags.push({ tag: "meta", attrs: { property: "og:image:alt", content: BRAND_SEO.imageAlt }, injectTo: "head" });
      html = html.replace('content="summary"', 'content="summary_large_image"');
    }
    return { html, tags };
  },
};
export default defineConfig(({ mode }) => {
  const localLeads = mode === "development" && process.env.VITE_LANDING_LOCAL_LEADS === "true";
  return {
  plugins: [react(), tailwindcss(), commercialSeo, ...(localLeads ? [{
    name: "local-lead-fixture",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/__lead-local/privacy", (_req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end("<!doctype html><html lang='es'><title>Prueba local</title><body style='background:#1c1e1b;color:white;font:16px/1.6 sans-serif;padding:24px'><h1>Aviso de prueba local — solo datos sintéticos</h1><p>Este entorno captura solicitudes y correos en almacenamiento local para validar el flujo. No envía correos ni constituye un aviso de privacidad aprobado para producción. No introduzcas datos personales reales.</p></body></html>");
      });
    },
  }] : [])],
  server: localLeads ? { proxy: { "/__lead-local/leads": { target: `http://127.0.0.1:${process.env.LEAD_LOCAL_PROXY_PORT || "4010"}`, rewrite: () => "/leads" } } } : undefined,
  cacheDir: process.env.LANDING_VITE_CACHE_DIR || "node_modules/.vite",
  test: {
    exclude: [...configDefaults.exclude],
    environment: "jsdom",
  },
};
});
