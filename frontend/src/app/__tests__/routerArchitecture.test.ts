import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const routerSource = readFileSync(resolve(appDirectory, "../router.tsx"), "utf8");
const sidebarSource = readFileSync(
  resolve(appDirectory, "../../components/layout/Sidebar.tsx"),
  "utf8",
);
const viteConfigSource = readFileSync(
  resolve(appDirectory, "../../../vite.config.ts"),
  "utf8",
);
const authBarrelSource = readFileSync(
  resolve(appDirectory, "../../features/auth/index.ts"),
  "utf8",
);

describe("AUD-015 route architecture", () => {
  it("keeps feature pages out of the eager router module", () => {
    const eagerFeatureImports = routerSource.match(
      /from ["']\.\.\/features\/(?!auth)/g,
    );

    expect(eagerFeatureImports).toBeNull();
    expect(routerSource).not.toContain("from \"../features/auth\"");
    expect(authBarrelSource).not.toContain("./pages/");
    expect(routerSource).toContain("<Suspense");
    expect(routerSource).toContain("RouteLoadErrorBoundary");
  });

  it("prefetches an allowed route only from explicit navigation intent", () => {
    expect(sidebarSource).toContain("preloadRoute");
    expect(sidebarSource).toContain("onMouseEnter");
    expect(sidebarSource).toContain("onFocus");
  });

  it("registers the bundle budget in the Vite build", () => {
    expect(viteConfigSource).toContain("createBundleBudgetPlugin");
  });
});
