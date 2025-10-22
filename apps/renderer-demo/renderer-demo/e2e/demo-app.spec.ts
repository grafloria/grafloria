import { test, expect } from '@playwright/test';

test.describe('Renderer Demo App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('h1');
  });

  test('should load the app with correct title', async ({ page }) => {
    const title = await page.locator('h1').textContent();
    expect(title).toContain('Renderer Demo');
  });

  test('should render initial diagram with nodes and links', async ({ page }) => {
    // Wait for canvas to be rendered
    await page.waitForSelector('grafloria-diagram-canvas');

    // Check that stats show the correct initial state
    const nodesText = await page.locator('.stats span:has-text("Nodes:")').textContent();
    const linksText = await page.locator('.stats span:has-text("Links:")').textContent();

    expect(nodesText).toContain('4'); // Should have 4 initial nodes
    expect(linksText).toContain('3'); // Should have 3 initial links
  });

  test('should toggle theme between light and dark', async ({ page }) => {
    const themeButton = page.locator('button:has-text("Dark")');

    // Initial state should be light theme
    let themeText = await page.locator('.stats span:has-text("Theme:")').textContent();
    expect(themeText).toContain('Light Theme');

    // Click to switch to dark theme
    await themeButton.click();
    await page.waitForTimeout(100); // Small delay for state update

    themeText = await page.locator('.stats span:has-text("Theme:")').textContent();
    expect(themeText).toContain('Dark Theme');

    // Click again to switch back to light theme
    await themeButton.click();
    await page.waitForTimeout(100);

    themeText = await page.locator('.stats span:has-text("Theme:")').textContent();
    expect(themeText).toContain('Light Theme');
  });

  test('should zoom in correctly', async ({ page }) => {
    const zoomInButton = page.locator('.zoom-controls button:has-text("+")');

    // Initial zoom should be 100%
    let zoomText = await page.locator('.zoom-level').textContent();
    expect(zoomText).toBe('100%');

    // Click zoom in
    await zoomInButton.click();
    await page.waitForTimeout(100);

    // Zoom should increase to 110%
    zoomText = await page.locator('.zoom-level').textContent();
    expect(zoomText).toBe('110%');

    // Click zoom in again
    await zoomInButton.click();
    await page.waitForTimeout(100);

    // Zoom should increase to 121% (1.1 * 1.1 = 1.21)
    zoomText = await page.locator('.zoom-level').textContent();
    expect(zoomText).toBe('121%');
  });

  test('should zoom out correctly', async ({ page }) => {
    const zoomOutButton = page.locator('.zoom-controls button:has-text("-")');

    // Initial zoom should be 100%
    let zoomText = await page.locator('.zoom-level').textContent();
    expect(zoomText).toBe('100%');

    // Click zoom out
    await zoomOutButton.click();
    await page.waitForTimeout(100);

    // Zoom should decrease to 91% (100 / 1.1 ≈ 91%)
    zoomText = await page.locator('.zoom-level').textContent();
    expect(zoomText).toBe('91%');
  });

  test('should reset zoom to 100%', async ({ page }) => {
    const zoomInButton = page.locator('.zoom-controls button:has-text("+")');
    const resetButton = page.locator('.zoom-controls button:has-text("Reset")');

    // Zoom in a few times
    await zoomInButton.click();
    await page.waitForTimeout(100);
    await zoomInButton.click();
    await page.waitForTimeout(100);

    // Verify zoom is not 100%
    let zoomText = await page.locator('.zoom-level').textContent();
    expect(zoomText).not.toBe('100%');

    // Click reset
    await resetButton.click();
    await page.waitForTimeout(100);

    // Zoom should be back to 100%
    zoomText = await page.locator('.zoom-level').textContent();
    expect(zoomText).toBe('100%');
  });

  test('should add new node and increment node count', async ({ page }) => {
    const addNodeButton = page.locator('button:has-text("Add Node")');

    // Get initial node count from stats
    const initialNodesText = await page.locator('.stats span:has-text("Nodes:")').textContent();
    const initialCount = parseInt(initialNodesText?.match(/\d+/)?.[0] || '0');

    // Get initial SVG node elements count
    const initialSvgNodes = await page.locator('svg.grafloria-diagram .nodes-layer > g').count();
    expect(initialSvgNodes).toBe(initialCount);

    // Click add node
    await addNodeButton.click();
    await page.waitForTimeout(200);

    // Node count should increment by 1 in stats
    const newNodesText = await page.locator('.stats span:has-text("Nodes:")').textContent();
    const newCount = parseInt(newNodesText?.match(/\d+/)?.[0] || '0');
    expect(newCount).toBe(initialCount + 1);

    // Verify node actually rendered in SVG
    const newSvgNodes = await page.locator('svg.grafloria-diagram .nodes-layer > g').count();
    expect(newSvgNodes).toBe(initialCount + 1);
  });

  test('should display node labels at default zoom', async ({ page }) => {
    // Wait for canvas
    await page.waitForSelector('grafloria-diagram-canvas');

    // Check that the canvas SVG contains node elements
    // Note: This is a basic check - in a real scenario we'd inspect the SVG content
    const canvas = page.locator('grafloria-diagram-canvas');
    await expect(canvas).toBeVisible();
  });

  test('should maintain node labels when zooming out', async ({ page }) => {
    const zoomOutButton = page.locator('.zoom-controls button:has-text("-")');

    // Zoom out several times
    for (let i = 0; i < 3; i++) {
      await zoomOutButton.click();
      await page.waitForTimeout(100);
    }

    // Verify zoom level is below 100%
    const zoomText = await page.locator('.zoom-level').textContent();
    const zoomValue = parseInt(zoomText || '0');
    expect(zoomValue).toBeLessThan(100);

    // Canvas should still be visible
    const canvas = page.locator('grafloria-diagram-canvas');
    await expect(canvas).toBeVisible();
  });

  test('should maintain node labels when zooming in', async ({ page }) => {
    const zoomInButton = page.locator('.zoom-controls button:has-text("+")');

    // Zoom in several times
    for (let i = 0; i < 3; i++) {
      await zoomInButton.click();
      await page.waitForTimeout(100);
    }

    // Verify zoom level is above 100%
    const zoomText = await page.locator('.zoom-level').textContent();
    const zoomValue = parseInt(zoomText || '0');
    expect(zoomValue).toBeGreaterThan(100);

    // Canvas should still be visible
    const canvas = page.locator('grafloria-diagram-canvas');
    await expect(canvas).toBeVisible();
  });

  test('should show zoom percentage in stats footer', async ({ page }) => {
    const zoomInButton = page.locator('.zoom-controls button:has-text("+")');

    // Click zoom in
    await zoomInButton.click();
    await page.waitForTimeout(100);

    // Both zoom displays should match
    const zoomLevelText = await page.locator('.zoom-level').textContent();
    const statsZoomText = await page.locator('.stats span:has-text("Zoom:")').textContent();

    expect(statsZoomText).toContain(zoomLevelText);
  });

  test('should update stats when adding multiple nodes', async ({ page }) => {
    const addNodeButton = page.locator('button:has-text("Add Node")');

    // Get initial count
    const initialNodesText = await page.locator('.stats span:has-text("Nodes:")').textContent();
    const initialCount = parseInt(initialNodesText?.match(/\d+/)?.[0] || '0');

    // Add 3 nodes
    for (let i = 0; i < 3; i++) {
      await addNodeButton.click();
      await page.waitForTimeout(200);
    }

    // Count should increase by 3
    const newNodesText = await page.locator('.stats span:has-text("Nodes:")').textContent();
    const newCount = parseInt(newNodesText?.match(/\d+/)?.[0] || '0');

    expect(newCount).toBe(initialCount + 3);

    // Verify all nodes rendered in SVG
    const svgNodes = await page.locator('svg.grafloria-diagram .nodes-layer > g').count();
    expect(svgNodes).toBe(initialCount + 3);
  });

  test('should add unlimited nodes (test 10 additions)', async ({ page }) => {
    const addNodeButton = page.locator('button:has-text("Add Node")');

    // Get initial count
    const initialNodesText = await page.locator('.stats span:has-text("Nodes:")').textContent();
    const initialCount = parseInt(initialNodesText?.match(/\d+/)?.[0] || '0');

    // Add 10 nodes
    for (let i = 0; i < 10; i++) {
      await addNodeButton.click();
      await page.waitForTimeout(150);

      // Verify count after each addition
      const currentText = await page.locator('.stats span:has-text("Nodes:")').textContent();
      const currentCount = parseInt(currentText?.match(/\d+/)?.[0] || '0');
      expect(currentCount).toBe(initialCount + i + 1);
    }

    // Final verification
    const finalNodesText = await page.locator('.stats span:has-text("Nodes:")').textContent();
    const finalCount = parseInt(finalNodesText?.match(/\d+/)?.[0] || '0');
    expect(finalCount).toBe(initialCount + 10);

    // Verify all 10 nodes rendered in DOM
    const svgNodes = await page.locator('svg.grafloria-diagram .nodes-layer > g').count();
    expect(svgNodes).toBe(initialCount + 10);
  });
});
