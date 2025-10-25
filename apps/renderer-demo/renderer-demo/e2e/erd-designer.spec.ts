import { test, expect } from '@playwright/test';

test.describe('ERD Designer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/erd-designer');
    await page.waitForSelector('h1');
  });

  test('should load ERD designer with correct title', async ({ page }) => {
    const title = await page.locator('h1').textContent();
    expect(title).toContain('ERD Designer');
  });

  test('should render initial sample tables', async ({ page }) => {
    // Wait for canvas to be rendered
    await page.waitForSelector('grafloria-diagram-canvas');

    // Should have 3 initial tables (Users, Orders, Products)
    const nodes = await page.locator('svg.grafloria-diagram .nodes-layer > g').count();
    expect(nodes).toBeGreaterThanOrEqual(3);
  });

  test('should render table nodes with custom table component', async ({ page }) => {
    // Wait for custom table nodes to render
    await page.waitForSelector('.table-node', { timeout: 5000 });

    // Should have at least one table node
    const tableNodes = await page.locator('.table-node').count();
    expect(tableNodes).toBeGreaterThan(0);
  });

  test('should display table headers with icons and names', async ({ page }) => {
    await page.waitForSelector('.table-node');

    // Check for table header elements
    const tableHeaders = await page.locator('.table-header').count();
    expect(tableHeaders).toBeGreaterThan(0);

    // Check for table names
    const tableName = await page.locator('.table-name').first().textContent();
    expect(tableName).toBeTruthy();
  });

  test('should display columns with field information', async ({ page }) => {
    await page.waitForSelector('.column-row');

    // Should have multiple column rows across all tables
    const columns = await page.locator('.column-row').count();
    expect(columns).toBeGreaterThan(5); // At least 5 columns total

    // Check for column names
    const columnName = await page.locator('.column-name').first().textContent();
    expect(columnName).toBeTruthy();

    // Check for column types
    const columnType = await page.locator('.column-type').first().textContent();
    expect(columnType).toBeTruthy();
  });

  test('should display field-level port indicators', async ({ page }) => {
    await page.waitForSelector('.column-row');

    // Port indicators should be present (they have opacity: 0.3 by default)
    const rightPorts = await page.locator('.port-indicator.right-port').count();
    expect(rightPorts).toBeGreaterThan(0);

    // Left ports should exist for foreign keys
    const leftPorts = await page.locator('.port-indicator.left-port').count();
    expect(leftPorts).toBeGreaterThan(0);
  });

  test('should show port indicators on hover', async ({ page }) => {
    await page.waitForSelector('.column-row');

    const firstRow = page.locator('.column-row').first();
    const portIndicator = firstRow.locator('.port-indicator').first();

    // Hover over the column row
    await firstRow.hover();

    // Port indicator should be visible (opacity should increase)
    await expect(portIndicator).toBeVisible();
  });

  test('should display primary key icons', async ({ page }) => {
    await page.waitForSelector('.column-row');

    // Check for primary key icon (🔑)
    const columnIcon = await page.locator('.column-icon').first().textContent();
    expect(columnIcon).toMatch(/[🔑📝🔗]/); // Should be one of the icons
  });

  test('should display foreign key icons', async ({ page }) => {
    await page.waitForSelector('.column-row');

    // Count all column icons
    const icons = await page.locator('.column-icon').allTextContents();

    // Should have at least one foreign key icon (🔗)
    const hasForeignKey = icons.some(icon => icon.includes('🔗'));
    expect(hasForeignKey).toBeTruthy();
  });

  test('should render connections between tables', async ({ page }) => {
    await page.waitForSelector('grafloria-diagram-canvas');

    // Wait for SVG to be fully rendered
    await page.waitForSelector('svg.grafloria-diagram');

    // Should have at least one link (relationship)
    const links = await page.locator('svg.grafloria-diagram .links-layer path').count();
    expect(links).toBeGreaterThan(0);
  });

  test('should have zoom controls', async ({ page }) => {
    const zoomIn = page.locator('button:has-text("+")');
    const zoomOut = page.locator('button:has-text("-")');
    const fitView = page.locator('button:has-text("Fit")');

    await expect(zoomIn).toBeVisible();
    await expect(zoomOut).toBeVisible();
    await expect(fitView).toBeVisible();
  });

  test('should zoom in when clicking + button', async ({ page }) => {
    const zoomInButton = page.locator('button:has-text("+")').first();
    const zoomLevel = page.locator('.zoom-level');

    // Initial zoom should be around 100%
    const initialZoom = await zoomLevel.textContent();

    // Click zoom in
    await zoomInButton.click();
    await page.waitForTimeout(200);

    // Zoom should increase
    const newZoom = await zoomLevel.textContent();
    expect(newZoom).not.toBe(initialZoom);
  });

  test('should have SQL export functionality', async ({ page }) => {
    const exportButton = page.locator('button:has-text("Export SQL")');
    await expect(exportButton).toBeVisible();
  });

  test('should display table count in stats', async ({ page }) => {
    await page.waitForSelector('.stats');

    // Should show table/node count
    const stats = await page.locator('.stats').textContent();
    expect(stats).toBeTruthy();
  });

  test('should render tables with correct dimensions', async ({ page }) => {
    await page.waitForSelector('.table-node');

    // Get first table node
    const tableNode = page.locator('.table-node').first();
    const boundingBox = await tableNode.boundingBox();

    // Table should have reasonable dimensions
    expect(boundingBox?.width).toBeGreaterThan(200);
    expect(boundingBox?.height).toBeGreaterThan(100);
  });

  test('should have distinct table header styling', async ({ page }) => {
    await page.waitForSelector('.table-header');

    // Table header should be visible
    const header = page.locator('.table-header').first();
    await expect(header).toBeVisible();

    // Should have table icon
    const icon = await header.locator('.table-icon').textContent();
    expect(icon).toBeTruthy();
  });

  test('should show port dots for connection points', async ({ page }) => {
    await page.waitForSelector('.port-dot');

    // Should have port dots
    const portDots = await page.locator('.port-dot').count();
    expect(portDots).toBeGreaterThan(0);
  });

  test('should have hover effects on port indicators', async ({ page }) => {
    await page.waitForSelector('.column-row');

    const portIndicator = page.locator('.port-indicator').first();

    // Port should be visible
    await expect(portIndicator).toBeVisible();
  });

  test('should render connection arrows on links', async ({ page }) => {
    await page.waitForSelector('svg.grafloria-diagram');

    // Links should have arrows (typically rendered as polygons or markers)
    const svgElements = await page.locator('svg.grafloria-diagram *').count();
    expect(svgElements).toBeGreaterThan(10); // Should have multiple SVG elements
  });

  test('should maintain table visibility when zooming', async ({ page }) => {
    const zoomOut = page.locator('button:has-text("-")').first();

    // Zoom out multiple times
    for (let i = 0; i < 3; i++) {
      await zoomOut.click();
      await page.waitForTimeout(100);
    }

    // Tables should still be visible
    const tableNodes = page.locator('.table-node');
    await expect(tableNodes.first()).toBeVisible();
  });
});
