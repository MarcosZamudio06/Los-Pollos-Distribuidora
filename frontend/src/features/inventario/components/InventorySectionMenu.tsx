import type { KeyboardEvent } from "react";
import {
  getInventorySectionPanelId,
  getInventorySectionTabId,
  type InventorySection,
  type InventorySectionKey,
} from "./inventorySections";

type InventorySectionMenuProps = {
  sections: readonly InventorySection[];
  activeSection: InventorySectionKey;
  onSectionChange: (section: InventorySectionKey) => void;
};

export function InventorySectionMenu({
  activeSection,
  onSectionChange,
  sections,
}: InventorySectionMenuProps) {
  function focusSection(index: number) {
    const section = sections[index];
    if (!section) return;

    onSectionChange(section.key);
    document.getElementById(getInventorySectionTabId(section.key))?.focus();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusSection((index + 1) % sections.length);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusSection((index - 1 + sections.length) % sections.length);
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusSection(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      focusSection(sections.length - 1);
    }
  }

  return (
    <nav
      aria-label="Secciones de inventario"
      className="overflow-x-auto rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-2 shadow-[0_18px_50px_rgba(16,24,32,0.06)]"
      role="tablist"
      aria-orientation="horizontal"
    >
      <div className="flex w-max min-w-max gap-2">
        {sections.map((section, index) => {
          const isActive = activeSection === section.key;
          const Icon = section.icon;
          return (
            <button
              aria-controls={getInventorySectionPanelId(section.key)}
              aria-selected={isActive}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(214,155,45,0.34)] ${isActive ? "border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] text-white shadow-[0_10px_24px_rgba(157,45,36,0.2)] hover:bg-[var(--erp-brand-red-strong)]" : "border-transparent bg-transparent text-[var(--erp-foreground)] hover:border-[var(--erp-border)] hover:bg-[var(--erp-surface-muted)]"}`}
              id={getInventorySectionTabId(section.key)}
              key={section.key}
              onClick={() => onSectionChange(section.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {section.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
