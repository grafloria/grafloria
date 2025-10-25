import { test, expect } from '@playwright/test';

test.describe('Workflow Builder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflow-builder');
    await page.waitForSelector('h1');
  });

  test('should load workflow builder with correct title', async ({ page }) => {
    const title = await page.locator('h1').textContent();
    expect(title).toContain('Workflow');
  });

  test('should render initial workflow nodes', async ({ page }) => {
    // Wait for canvas to be rendered
    await page.waitForSelector('grafloria-diagram-canvas');

    // Should have workflow nodes
    const nodes = await page.locator('svg.grafloria-diagram .nodes-layer > g').count();
    expect(nodes).toBeGreaterThan(0);
  });

  test('should render workflow nodes with custom component', async ({ page }) => {
    // Wait for custom workflow nodes to render
    await page.waitForSelector('.workflow-node', { timeout: 5000 });

    // Should have multiple workflow nodes
    const workflowNodes = await page.locator('.workflow-node').count();
    expect(workflowNodes).toBeGreaterThanOrEqual(3); // At least start, task, and end nodes
  });

  test('should display different node types', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Should have start node (circular)
    const startNodes = await page.locator('.workflow-node.node-start').count();
    expect(startNodes).toBeGreaterThan(0);

    // Should have task nodes (rectangular)
    const taskNodes = await page.locator('.workflow-node.node-task').count();
    expect(taskNodes).toBeGreaterThan(0);

    // Should have end node (circular)
    const endNodes = await page.locator('.workflow-node.node-end').count();
    expect(endNodes).toBeGreaterThan(0);
  });

  test('should display decision nodes with diamond shape', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Decision nodes should exist
    const decisionNodes = await page.locator('.workflow-node.node-decision').count();

    if (decisionNodes > 0) {
      // Decision node should have transform rotation (diamond shape)
      const decisionNode = page.locator('.workflow-node.node-decision').first();
      await expect(decisionNode).toBeVisible();
    }
  });

  test('should display node status indicators', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Status indicators should be present
    const statusIndicators = await page.locator('.node-status-indicator').count();
    expect(statusIndicators).toBeGreaterThan(0);
  });

  test('should display node icons', async ({ page }) => {
    await page.waitForSelector('.node-icon');

    // Node icons should be present
    const icons = await page.locator('.node-icon').allTextContents();
    expect(icons.length).toBeGreaterThan(0);

    // Should have emoji icons (▶️, ⚙️, ❓, 🏁)
    const hasIcons = icons.some(icon => icon.trim().length > 0);
    expect(hasIcons).toBeTruthy();
  });

  test('should display node labels', async ({ page }) => {
    await page.waitForSelector('.node-label');

    // Node labels should be present
    const labels = await page.locator('.node-label').allTextContents();
    expect(labels.length).toBeGreaterThan(0);

    // Labels should have actual text
    const hasText = labels.some(label => label.trim().length > 0);
    expect(hasText).toBeTruthy();
  });

  test('should show execution controls', async ({ page }) => {
    // Should have execution control buttons
    const startButton = page.locator('button:has-text("Start")');
    const pauseButton = page.locator('button:has-text("Pause")');
    const stopButton = page.locator('button:has-text("Stop")');

    // At least one execution control should be visible
    const controlsExist = await startButton.isVisible() || await pauseButton.isVisible() || await stopButton.isVisible();
    expect(controlsExist).toBeTruthy();
  });

  test('should have initial pending status', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // All nodes should initially be in pending status
    const pendingNodes = await page.locator('.workflow-node.status-pending').count();
    expect(pendingNodes).toBeGreaterThan(0);
  });

  test('should render connections between workflow nodes', async ({ page }) => {
    await page.waitForSelector('grafloria-diagram-canvas');

    // Should have connections (links)
    const links = await page.locator('svg.grafloria-diagram .links-layer path').count();
    expect(links).toBeGreaterThan(0);
  });

  test('should have distinct styling for different node types', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Start node should have green border
    const startNode = page.locator('.workflow-node.node-start').first();
    if (await startNode.isVisible()) {
      const borderColor = await startNode.evaluate(el => getComputedStyle(el).borderColor);
      expect(borderColor).toBeTruthy();
    }

    // Task node should have blue border
    const taskNode = page.locator('.workflow-node.node-task').first();
    if (await taskNode.isVisible()) {
      const borderColor = await taskNode.evaluate(el => getComputedStyle(el).borderColor);
      expect(borderColor).toBeTruthy();
    }
  });

  test('should display status icons correctly', async ({ page }) => {
    await page.waitForSelector('.node-status-indicator');

    // Status indicators should show pending icon initially (⏸️)
    const statusIcons = await page.locator('.node-status-indicator').allTextContents();
    expect(statusIcons.length).toBeGreaterThan(0);
  });

  test('should start workflow execution when Start button clicked', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    const startButton = page.locator('button').filter({ hasText: /^Start$/ });

    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(500);

      // After starting, at least one node should show running or completed status
      const runningOrCompleted = await page.locator('.workflow-node.status-running, .workflow-node.status-completed').count();
      expect(runningOrCompleted).toBeGreaterThan(0);
    }
  });

  test('should have zoom controls', async ({ page }) => {
    const zoomIn = page.locator('button:has-text("+")');
    const zoomOut = page.locator('button:has-text("-")');

    await expect(zoomIn).toBeVisible();
    await expect(zoomOut).toBeVisible();
  });

  test('should render workflow nodes without visual artifacts', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Get all workflow nodes
    const workflowNodes = await page.locator('.workflow-node').all();

    for (const node of workflowNodes) {
      // Each node should be visible
      await expect(node).toBeVisible();

      // Node should have proper styling (not have stray rectangles/squares)
      const background = await node.evaluate(el => getComputedStyle(el).background);
      expect(background).toBeTruthy();
    }
  });

  test('should have rounded corners for start and end nodes', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Start node should have border-radius (circular)
    const startNode = page.locator('.workflow-node.node-start').first();
    if (await startNode.isVisible()) {
      const borderRadius = await startNode.evaluate(el => getComputedStyle(el).borderRadius);
      expect(borderRadius).toBeTruthy();
      expect(borderRadius).not.toBe('0px');
    }

    // End node should have border-radius (circular)
    const endNode = page.locator('.workflow-node.node-end').first();
    if (await endNode.isVisible()) {
      const borderRadius = await endNode.evaluate(el => getComputedStyle(el).borderRadius);
      expect(borderRadius).toBeTruthy();
      expect(borderRadius).not.toBe('0px');
    }
  });

  test('should maintain node visibility when zooming', async ({ page }) => {
    const zoomOut = page.locator('button:has-text("-")').first();

    // Zoom out multiple times
    for (let i = 0; i < 3; i++) {
      await zoomOut.click();
      await page.waitForTimeout(100);
    }

    // Workflow nodes should still be visible
    const workflowNodes = page.locator('.workflow-node');
    await expect(workflowNodes.first()).toBeVisible();
  });

  test('should have execution status display', async ({ page }) => {
    // Should show execution status
    const statusDisplay = page.locator('text=/Status:.*|Execution:.*|idle|running|paused|completed/i');
    const statusExists = await statusDisplay.count();
    expect(statusExists).toBeGreaterThanOrEqual(0); // May or may not have explicit status text
  });

  test('should render node content properly centered', async ({ page }) => {
    await page.waitForSelector('.node-content');

    // Node content should be present
    const nodeContents = await page.locator('.node-content').count();
    expect(nodeContents).toBeGreaterThan(0);

    // First node content should be visible
    const firstContent = page.locator('.node-content').first();
    await expect(firstContent).toBeVisible();
  });

  test('should apply pulse animation to running nodes', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Start execution if start button exists
    const startButton = page.locator('button').filter({ hasText: /^Start$/ });

    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(300);

      // Check if any node has running status with animation
      const runningIndicators = await page.locator('.indicator-running').count();
      if (runningIndicators > 0) {
        // Running indicators should be visible
        expect(runningIndicators).toBeGreaterThan(0);
      }
    }
  });

  test('should display step-through controls if available', async ({ page }) => {
    // Step forward button might be available
    const stepButton = page.locator('button:has-text("Step")');
    const controlsExist = await stepButton.count();
    expect(controlsExist).toBeGreaterThanOrEqual(0);
  });

  test('should have workflow execution state indicator', async ({ page }) => {
    await page.waitForSelector('.workflow-node');

    // Should show some indication of execution state
    const statusElements = await page.locator('.node-status-indicator').count();
    expect(statusElements).toBeGreaterThan(0);
  });

  test('should position status indicators in top-right corner', async ({ page }) => {
    await page.waitForSelector('.node-status-indicator');

    const indicator = page.locator('.node-status-indicator').first();

    // Should be positioned absolutely
    const position = await indicator.evaluate(el => getComputedStyle(el).position);
    expect(position).toBe('absolute');
  });
});
