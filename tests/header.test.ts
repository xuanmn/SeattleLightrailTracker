import { describe, expect, it, vi } from "vitest";
import { HeaderComponent } from "../src/components/Header";

describe("HeaderComponent", () => {
  it("renders header actions including System Map and Guide buttons", () => {
    const onMapClick = vi.fn();
    const onFaqClick = vi.fn();
    const onSettingsClick = vi.fn();
    const onLineChange = vi.fn();

    const header = new HeaderComponent("line-1", {
      onMapClick,
      onFaqClick,
      onSettingsClick,
      onLineChange,
    });

    const el = header.getElement();
    expect(el).not.toBeNull();

    const mapBtn = el.querySelector(".header-map-btn") as HTMLButtonElement;
    expect(mapBtn).not.toBeNull();
    mapBtn.click();
    expect(onMapClick).toHaveBeenCalledTimes(1);

    const faqBtn = el.querySelectorAll(".header-text-btn")[1] as HTMLButtonElement;
    expect(faqBtn).not.toBeNull();
    faqBtn.click();
    expect(onFaqClick).toHaveBeenCalledTimes(1);

    const settingsBtn = el.querySelector('button[title*="Settings"]') as HTMLButtonElement;
    expect(settingsBtn).not.toBeNull();
    settingsBtn.click();
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });

  it("provides a clickable brand logo with reload capability", () => {
    const header = new HeaderComponent("line-1", {
      onMapClick: vi.fn(),
      onFaqClick: vi.fn(),
      onSettingsClick: vi.fn(),
      onLineChange: vi.fn(),
    });

    const el = header.getElement();
    const brand = el.querySelector(".brand-section") as HTMLElement;
    expect(brand).not.toBeNull();
    expect(brand.getAttribute("role")).toBe("button");
    expect(brand.getAttribute("title")).toBe("Reload live tracker");
  });

  it("does not fire onLineChange when clicking the already-active line button", () => {
    const onLineChange = vi.fn();
    const header = new HeaderComponent("line-1", {
      onMapClick: vi.fn(),
      onFaqClick: vi.fn(),
      onSettingsClick: vi.fn(),
      onLineChange,
    });

    const el = header.getElement();
    const [line1Btn, line2Btn] = el.querySelectorAll(".line-btn") as NodeListOf<HTMLButtonElement>;

    // Clicking already-active Line 1 should be a no-op
    line1Btn.click();
    expect(onLineChange).not.toHaveBeenCalled();

    // Clicking Line 2 should fire once
    line2Btn.click();
    expect(onLineChange).toHaveBeenCalledTimes(1);
    expect(onLineChange).toHaveBeenCalledWith("line-2");

    // Clicking already-active Line 2 again should be a no-op
    line2Btn.click();
    expect(onLineChange).toHaveBeenCalledTimes(1);
  });
});
