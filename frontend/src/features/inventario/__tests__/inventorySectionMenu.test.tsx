// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventorySectionMenu } from "../components/InventorySectionMenu";
import {
  inventoryAdminSections,
  type InventorySectionKey,
} from "../components/inventorySections";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function MenuHarness() {
  const [activeSection, setActiveSection] =
    useState<InventorySectionKey>("products");

  return (
    <InventorySectionMenu
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      sections={inventoryAdminSections}
    />
  );
}

describe("InventorySectionMenu", () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    root = undefined;
  });

  it("muestra las secciones y marca la pestaña activa con semántica de tabs", () => {
    const html = renderToStaticMarkup(
      <InventorySectionMenu
        activeSection="cedisSummary"
        onSectionChange={vi.fn()}
        sections={inventoryAdminSections}
      />,
    );

    expect(html).toContain("Devoluciones a CEDIS");
    expect(html).toContain("Productos y stock");
    expect(html).toContain("Resumen CEDIS");
    expect(html).toContain("Inventario por ubicación");
    expect(html).toContain("Traspasos");
    expect(html).toContain("Movimientos");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("inventory-section-panel-cedisSummary");
    expect(html).toContain('aria-hidden="true"');
  });

  it("mueve el foco y la pestaña activa con flechas, Home y End", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<MenuHarness />));
    const tabs = () =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

    await act(async () => {
      tabs()[1].dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
    });
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[2]);

    await act(async () => {
      tabs()[2].dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Home" }),
      );
    });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      tabs()[0].dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      );
    });
    expect(tabs()[5].getAttribute("aria-selected")).toBe("true");
  });
});
