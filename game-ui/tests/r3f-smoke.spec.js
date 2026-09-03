import { expect, test } from "@playwright/test";

test.setTimeout(60000);

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test(`Apple Archer 3D renders the TPV clinical scene on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://localhost:5173/r3f.html");

    const shell = page.locator(".r3f-shell");
    await expect(shell).toBeVisible();
    await expect(page.getByRole("button", { name: "Right" })).toHaveClass(/active/);

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    await page.waitForFunction(() => window.__APPLE_ARCHER_CLINICAL_STATE__?.targetAngle === 30, null, { timeout: 5000 });
    await expect.poll(async () => page.evaluate(() => window.__APPLE_ARCHER_CLINICAL_STATE__?.applePosition?.[0])).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Left" }).click();
    await expect.poll(async () => page.evaluate(() => window.__APPLE_ARCHER_CLINICAL_STATE__?.activeArm)).toBe("left");
    await expect.poll(async () => page.evaluate(() => window.__APPLE_ARCHER_CLINICAL_STATE__?.applePosition?.[0])).toBeLessThan(0);
    await page.getByRole("button", { name: "Right" }).click();
    await expect.poll(async () => page.evaluate(() => window.__APPLE_ARCHER_CLINICAL_STATE__?.activeArm)).toBe("right");
    await page.waitForFunction(() => window.__APPLE_ARCHER_MODEL_READY__ === true, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/r3f-smoke-${viewport.name}.png`, fullPage: true });

    const stats = await canvas.evaluate((node) => {
      const gl = node.getContext("webgl2") || node.getContext("webgl");
      if (!gl) return { hasWebgl: false, coloredPixels: 0, width: 0, height: 0 };

      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const samples = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, samples);

      let coloredPixels = 0;
      let opaquePixels = 0;
      for (let i = 0; i < samples.length; i += 4) {
        const r = samples[i];
        const g = samples[i + 1];
        const b = samples[i + 2];
        const a = samples[i + 3];
        if (a > 8) opaquePixels += 1;
        if (a > 0 && (r > 8 || g > 8 || b > 8)) coloredPixels += 1;
      }

      return { hasWebgl: true, coloredPixels, opaquePixels, width, height };
    });

    expect(stats.hasWebgl).toBe(true);
    expect(stats.width).toBeGreaterThan(0);
    expect(stats.height).toBeGreaterThan(0);
    expect(stats.coloredPixels).toBeGreaterThan(stats.width * stats.height * 0.45);
    expect(stats.opaquePixels).toBeGreaterThan(stats.width * stats.height * 0.45);
  });
}
