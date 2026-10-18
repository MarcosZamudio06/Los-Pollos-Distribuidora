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
    if (canonical) {
      tags.push({ tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" });
      tags.push({ tag: "meta", attrs: { property: "og:url", content: canonical }, injectTo: "head" });
      tags.push({ tag: "script", attrs: { type: "application/ld+json" }, children: JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: "ERP operativo para empresas", url: canonical, inLanguage: "es", description: "Ventas, inventario, distribución, cobranza y cierres en una plataforma ERP." }).replace(/</g, "\\u003c"), injectTo: "head" });
    }
    if (socialImage) {
      tags.push({ tag: "meta", attrs: { property: "og:image", content: socialImage }, injectTo: "head" });
      tags.push({ tag: "meta", attrs: { name: "twitter:image", content: socialImage }, injectTo: "head" });
      tags.push({ tag: "meta", attrs: { property: "og:image:alt", content: "ERP Operativo — pantalla real del producto" }, injectTo: "head" });
      html = html.replace('content="summary"', 'content="summary_large_image"');
    }
    return { html, tags };
  },
};
export default defineConfig({
  plugins: [react(), tailwindcss(), commercialSeo],
  cacheDir: process.env.LANDING_VITE_CACHE_DIR || "node_modules/.vite",
  test: {
    exclude: [...configDefaults.exclude],
    environment: "jsdom",
  },
});
