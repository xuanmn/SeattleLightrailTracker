import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import manifest from "../public/manifest.json";
import { StationCardComponent } from "../src/components/StationCard";
import { Station, StationArrivals } from "../src/types/transit";

describe("StationCard Live Approach Track", () => {
  const mockStation: Station = {
    id: "westlake",
    name: "Westlake",
    shortName: "Pine St / 4th Ave",
    lines: ["line-1", "line-2"],
    platforms: {
      northbound: {
        stopId: "40_1121",
        cardinalDirection: "Northbound",
        terminalDestination: "Lynnwood City Center",
      },
      southbound: {
        stopId: "40_1108",
        cardinalDirection: "Southbound",
        terminalDestination: "Federal Way Downtown",
      },
    },
  };

  it("renders approach track and activates it when a train is within 5 minutes", () => {
    const card = new StationCardComponent(mockStation, false, false, {
      onTogglePin: () => {},
    });

    const el = card.getElement();
    const trackWrap = el.querySelector(".station-approach-track-wrap") as HTMLElement;
    expect(trackWrap).not.toBeNull();
    expect(trackWrap.classList.contains("active")).toBe(false);

    const now = 1700000000000;
    const arrivalsData: StationArrivals = {
      station: mockStation,
      lastUpdated: now,
      direction1: {
        platform: mockStation.platforms.northbound!,
        arrivals: [
          {
            tripId: "trip_1",
            routeName: "1 Line",
            destination: "Lynnwood City Center",
            direction: "Northbound",
            scheduledDepartureTime: now + 3 * 60 * 1000, // 3 minutes away
            predictedDepartureTime: now + 3 * 60 * 1000,
            delaySeconds: 0,
            isRealtime: true,
            statusText: "On Time",
            statusType: "ontime",
          },
        ],
      },
      direction2: {
        platform: mockStation.platforms.southbound!,
        arrivals: [],
      },
    };

    card.updateArrivals(arrivalsData);
    expect(trackWrap.classList.contains("active")).toBe(true);

    const bar = trackWrap.querySelector(".station-approach-bar") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.className).toContain("line-1-approach");
  });

  it("deactivates approach track when no train is within 5 minutes", () => {
    const card = new StationCardComponent(mockStation, false, false, {
      onTogglePin: () => {},
    });

    const el = card.getElement();
    const trackWrap = el.querySelector(".station-approach-track-wrap") as HTMLElement;

    const now = 1700000000000;
    const arrivalsData: StationArrivals = {
      station: mockStation,
      lastUpdated: now,
      direction1: {
        platform: mockStation.platforms.northbound!,
        arrivals: [
          {
            tripId: "trip_far",
            routeName: "1 Line",
            destination: "Lynnwood City Center",
            direction: "Northbound",
            scheduledDepartureTime: now + 12 * 60 * 1000, // 12 minutes away
            predictedDepartureTime: now + 12 * 60 * 1000,
            delaySeconds: 0,
            isRealtime: true,
            statusText: "On Time",
            statusType: "ontime",
          },
        ],
      },
      direction2: {
        platform: mockStation.platforms.southbound!,
        arrivals: [],
      },
    };

    card.updateArrivals(arrivalsData);
    expect(trackWrap.classList.contains("active")).toBe(false);
  });

  it("renders 4 skeleton rows per platform on initial load and uses grammatical action labels on favorite button", () => {
    const card = new StationCardComponent(mockStation, false, false, {
      onTogglePin: () => {},
    });

    const el = card.getElement();
    const bodies = el.querySelectorAll(".platform-body");
    expect(bodies.length).toBe(2);
    expect(bodies[0].querySelectorAll(".skeleton-row").length).toBe(4);
    expect(bodies[1].querySelectorAll(".skeleton-row").length).toBe(4);

    const starBtn = el.querySelector(".star-btn") as HTMLButtonElement;
    expect(starBtn.getAttribute("aria-label")).toBe("Add Westlake to favorites");
    expect(starBtn.hasAttribute("aria-pressed")).toBe(false);

    card.setPinned(true);
    expect(starBtn.getAttribute("aria-label")).toBe("Remove Westlake from favorites");
    expect(starBtn.hasAttribute("aria-pressed")).toBe(false);
  });
});

describe("PWA Manifest Configuration", () => {
  it("contains valid standalone display mode and transit app metadata", () => {
    expect(manifest.name).toBe("Seattle Light Rail Tracker");
    expect(manifest.short_name).toBe("Link Tracker");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#0b0f17");
    expect(manifest.background_color).toBe("#070a0f");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    const hasAny = manifest.icons.some((i: { purpose?: string }) => i.purpose === "any");
    const hasMaskable = manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable");
    expect(hasAny).toBe(true);
    expect(hasMaskable).toBe(true);
  });
});

describe("SEO Configuration & Discoverability", () => {
  it("contains canonical URL, robots meta, JSON-LD structured data, and noscript crawler fallback in index.html", () => {
    const html = readFileSync(process.cwd() + "/index.html", "utf-8");

    expect(html).toContain('<link rel="canonical" href="https://xuanmn.github.io/SeattleLightrailTracker/" />');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<link rel="preconnect" href="https://api.pugetsound.onebusaway.org" crossorigin />');
    expect(html).toContain('<meta name="robots" content="index, follow');
    expect(html).toContain("application/ld+json");
    expect(html).toContain('"@type": "WebApplication"');
    expect(html).toContain("Seattle Light Rail Tracker");
    expect(html).toContain("<noscript>");
    expect(html).toContain("1 Line:");
    expect(html).toContain("2 Line:");
  });

  it("provides valid robots.txt and sitemap.xml files", () => {
    const robots = readFileSync(process.cwd() + "/public/robots.txt", "utf-8");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://xuanmn.github.io/SeattleLightrailTracker/sitemap.xml");

    const sitemap = readFileSync(process.cwd() + "/public/sitemap.xml", "utf-8");
    expect(sitemap).toContain("https://xuanmn.github.io/SeattleLightrailTracker/");
    expect(sitemap).toContain("<changefreq>daily</changefreq>");
  });

  it("self-hosts Inter and Outfit variable WOFF2 fonts with zero external Google Fonts requests", () => {
    const html = readFileSync(process.cwd() + "/index.html", "utf-8");
    const themeCss = readFileSync(process.cwd() + "/src/styles/theme.css", "utf-8");

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).toMatch(
      /<link\s+[^>]*rel="preload"[^>]*href="[^"]*inter-latin-var\.woff2"[^>]*as="font"[^>]*type="font\/woff2"[^>]*crossorigin/
    );

    expect(themeCss).toContain("inter-latin-var.woff2");
    expect(themeCss).toContain("outfit-latin-var.woff2");
    expect(themeCss).toContain("font-weight: 400 700");
    expect(themeCss).toContain("font-weight: 600 800");
    expect(themeCss).toContain("font-size-adjust: from-font");
  });
});

describe("PWA Offline Shell & Service Worker", () => {
  it("provides public/sw.js with app shell precaching and offline navigation support", () => {
    const sw = readFileSync(process.cwd() + "/public/sw.js", "utf-8");

    // Precache configuration
    expect(sw).toContain("CACHE_NAME");
    expect(sw).toContain("PRECACHE_ASSETS");
    expect(sw).toContain("./index.html");
    expect(sw).toContain("./manifest.json");

    // Event listeners
    expect(sw).toMatch(/addEventListener\(['"]install['"]/);
    expect(sw).toMatch(/addEventListener\(['"]activate['"]/);
    expect(sw).toMatch(/addEventListener\(['"]fetch['"]/);

    // Smart caching rules: skip caching dynamic OneBusAway API responses to prevent stale timers
    expect(sw).toContain("onebusaway.org");

    // Offline navigation fallback
    expect(sw).toMatch(/request\.mode === ['"]navigate['"]/);
  });

  it("includes service worker registration in src/main.ts", () => {
    const mainTs = readFileSync(process.cwd() + "/src/main.ts", "utf-8");
    expect(mainTs).toContain("'serviceWorker' in navigator");
    expect(mainTs).toContain("navigator.serviceWorker.register");
    expect(mainTs).toContain("./sw.js");
  });
});
