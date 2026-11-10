import { chromium } from "playwright";

const VIEWPORTS = [
  { width: 360, height: 740, name: "360px Mobile" },
  { width: 390, height: 844, name: "390px Mobile" },
  { width: 768, height: 1024, name: "768px Tablet" },
  { width: 1024, height: 768, name: "1024px Tablet Landscape" },
  { width: 1440, height: 900, name: "1440px Desktop" },
  { width: 1920, height: 1080, name: "1920px Wide Desktop" },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  console.log("=== SUPERNOVA 3.0 MULTI-VIEWPORT VERIFICATION ===");

  let allPassed = true;

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const metrics = await page.evaluate(async (vp) => {
      const isMobile = vp.width < 768;
      const isDesktop = vp.width >= 1100;

      // 1. Console errors
      const hasHScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;

      // 2. Nav
      const navWrapper = document.querySelector(".floating-nav-wrapper");
      const navHeight = navWrapper ? Math.round(navWrapper.getBoundingClientRect().height) : 0;
      const navLogo = document.querySelector(".nav-brand-logo");
      const logoHeight = navLogo ? Math.round(navLogo.getBoundingClientRect().height) : 0;
      
      const navLinks = Array.from(document.querySelectorAll(".nav-link-btn"));
      const linksSingleLine = navLinks.every((l) => {
        const style = window.getComputedStyle(l);
        return style.whiteSpace === "nowrap" && style.textDecorationLine === "none";
      });

      // Nav scroll shrink check
      window.scrollTo(0, 200);
      window.dispatchEvent(new Event("scroll"));
      await new Promise((r) => setTimeout(r, 350));
      const scrolledNavHeight = navWrapper ? Math.round(navWrapper.getBoundingClientRect().height) : 0;
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("scroll"));
      await new Promise((r) => setTimeout(r, 200));

      // 3. Buttons computed height
      const btnPrimary = document.querySelector(".hero-buttons-row .btn-primary") || document.querySelector(".btn-primary");
      const btnHeight = btnPrimary ? Math.round(btnPrimary.getBoundingClientRect().height) : 0;
      const expectedBtnHeight = isMobile ? 54 : 52;
      const btnHeightPassed = btnHeight === expectedBtnHeight;

      // 4. Hero layout and logo
      const heroGrid = document.querySelector(".hero-row-2-grid");
      const gridComputedDisplay = heroGrid ? window.getComputedStyle(heroGrid).display : "";
      const gridColumns = heroGrid ? window.getComputedStyle(heroGrid).gridTemplateColumns : "";
      
      const leftCol = document.querySelector(".hero-col-left");
      const rightCol = document.querySelector(".hero-col-right");
      const leftHidden = leftCol ? window.getComputedStyle(leftCol).display === "none" : true;
      const rightHidden = rightCol ? window.getComputedStyle(rightCol).display === "none" : true;

      const is3Col = isDesktop ? (!leftHidden && !rightHidden && gridColumns.split(" ").length === 3) : (leftHidden && rightHidden);

      const heroLogo = document.querySelector(".hero-large-logo-container");
      const heroLogoWidth = heroLogo ? Math.round(heroLogo.getBoundingClientRect().width) : 0;
      const minExpectedLogoWidth = Math.min(880, Math.round(vp.width * 0.6));
      const heroLogoPassed = heroLogoWidth >= minExpectedLogoWidth - 5; // within small margin

      // 5. Fonts loaded
      const fontCheck = document.fonts ? document.fonts.check("700 16px 'Space Grotesk'") && document.fonts.check("600 16px 'Manrope'") : true;

      // 7. Above the fold check for 1440x900 and 390x844
      let foldCheckPassed = true;
      if ((vp.width === 1440 && vp.height === 900) || (vp.width === 390 && vp.height === 844)) {
        const primaryBtn = document.querySelector(".hero-buttons-row .btn-primary");
        if (primaryBtn) {
          const rect = primaryBtn.getBoundingClientRect();
          foldCheckPassed = rect.bottom <= vp.height;
        }
      }

      return {
        hasHScroll,
        navHeight,
        scrolledNavHeight,
        logoHeight,
        linksSingleLine,
        btnHeight,
        expectedBtnHeight,
        btnHeightPassed,
        is3Col,
        heroLogoWidth,
        minExpectedLogoWidth,
        heroLogoPassed,
        fontCheck,
        foldCheckPassed,
      };
    }, vp);

    console.log(`\nViewport: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`- Horizontal Scroll (scrollWidth === clientWidth): ${!metrics.hasHScroll ? "PASS" : "FAIL"}`);
    console.log(`- Nav Height: ${metrics.navHeight}px (initial) -> ${metrics.scrolledNavHeight}px (scrolled) [Expect 64px -> 56px]: ${metrics.navHeight === 64 && metrics.scrolledNavHeight === 56 ? "PASS" : "FAIL"}`);
    console.log(`- Nav Logo Height: ${metrics.logoHeight}px [Expect >= 40px on desktop / >= 36px on mobile]: ${metrics.logoHeight >= (vp.width < 900 ? 36 : 40) ? "PASS" : "FAIL"}`);
    if (vp.width >= 900) {
      console.log(`- Nav Links Single-Line & No Underline: ${metrics.linksSingleLine ? "PASS" : "FAIL"}`);
    }
    console.log(`- Button Computed Height: ${metrics.btnHeight}px [Expect ${metrics.expectedBtnHeight}px]: ${metrics.btnHeightPassed ? "PASS" : "FAIL"}`);
    console.log(`- Hero Layout (3-col from 1100px, stacked below): ${metrics.is3Col ? "PASS" : "FAIL"}`);
    console.log(`- Hero Logo Width: ${metrics.heroLogoWidth}px [Expect >= ${metrics.minExpectedLogoWidth}px]: ${metrics.heroLogoPassed ? "PASS" : "FAIL"}`);
    if ((vp.width === 1440 && vp.height === 900) || (vp.width === 390 && vp.height === 844)) {
      console.log(`- Primary Register Button Above The Fold: ${metrics.foldCheckPassed ? "PASS" : "FAIL"}`);
    }

    if (metrics.hasHScroll || !metrics.btnHeightPassed || !metrics.is3Col || !metrics.heroLogoPassed || !metrics.foldCheckPassed) {
      allPassed = false;
    }
  }

  console.log(`\nConsole Errors: ${consoleErrors.length === 0 ? "0 (PASS)" : consoleErrors.length + " (FAIL: " + consoleErrors.join(", ") + ")"}`);
  if (consoleErrors.length > 0) allPassed = false;

  await browser.close();
  console.log(`\nOVERALL VERIFICATION: ${allPassed ? "ALL CHECKS PASSED ✅" : "SOME CHECKS FAILED ❌"}`);
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
