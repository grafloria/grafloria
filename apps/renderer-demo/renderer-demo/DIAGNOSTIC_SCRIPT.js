/**
 * Diagnostic script for debugging elk-comparison port and link issues
 *
 * This script should be run in the browser console when viewing elk-comparison page
 * to diagnose what's actually happening with Node 6 connections
 */

// Run this in browser console on elk-comparison page:
function diagnoseElkComparison() {
  console.log('🔍 ELK COMPARISON DIAGNOSTIC TOOL');
  console.log('='.repeat(60));

  // Get the Angular component instance (this is a hack, but useful for debugging)
  const canvasEl = document.querySelector('grafloria-diagram-canvas');
  if (!canvasEl) {
    console.error('❌ Cannot find diagram canvas element');
    return;
  }

  // Try to access the engine through Angular's component
  // Note: This requires Angular DevTools or accessing via __ngContext__
  console.log('\n📊 NODES:');
  console.log('-'.repeat(60));

  // Since we can't easily access the engine, let's examine the SVG directly
  const svg = document.querySelector('svg');
  if (!svg) {
    console.error('❌ Cannot find SVG element');
    return;
  }

  // Find all node elements
  const nodes = svg.querySelectorAll('.node-group');
  console.log(`Found ${nodes.length} nodes`);

  nodes.forEach((node, i) => {
    const rect = node.querySelector('rect');
    if (rect) {
      const x = parseFloat(rect.getAttribute('x') || '0');
      const y = parseFloat(rect.getAttribute('y') || '0');
      const width = parseFloat(rect.getAttribute('width') || '0');
      const height = parseFloat(rect.getAttribute('height') || '0');
      const text = node.querySelector('text')?.textContent || 'Unknown';

      console.log(`\n  Node ${i}: ${text}`);
      console.log(`    Position: (${x}, ${y})`);
      console.log(`    Size: ${width} × ${height}`);
      console.log(`    Bounds: left=${x}, top=${y}, right=${x + width}, bottom=${y + height}`);
    }
  });

  // Find all link paths
  console.log('\n🔗 LINKS:');
  console.log('-'.repeat(60));
  const links = svg.querySelectorAll('.link-group path');
  console.log(`Found ${links.length} link paths`);

  links.forEach((link, i) => {
    const d = link.getAttribute('d');
    if (d) {
      // Parse the path to get start and end points
      const matches = d.match(/M\s*([\d.]+)\s*([\d.]+).*L\s*([\d.]+)\s*([\d.]+)/);
      if (matches) {
        const [, startX, startY, endX, endY] = matches;
        console.log(`\n  Link ${i}:`);
        console.log(`    Start: (${startX}, ${startY})`);
        console.log(`    End: (${endX}, ${endY})`);
        console.log(`    Path: ${d.substring(0, 100)}...`);
      }
    }
  });

  // Find all arrows
  console.log('\n➤ ARROWS:');
  console.log('-'.repeat(60));
  const arrows = svg.querySelectorAll('.arrow');
  console.log(`Found ${arrows.length} arrows`);

  arrows.forEach((arrow, i) => {
    const transform = arrow.getAttribute('transform');
    console.log(`\n  Arrow ${i}:`);
    console.log(`    Transform: ${transform}`);

    // Parse transform to get position
    const translateMatch = transform?.match(/translate\(([\d.-]+),\s*([\d.-]+)\)/);
    const rotateMatch = transform?.match(/rotate\(([\d.-]+)\)/);
    if (translateMatch) {
      console.log(`    Position: (${translateMatch[1]}, ${translateMatch[2]})`);
    }
    if (rotateMatch) {
      console.log(`    Rotation: ${rotateMatch[1]}°`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnostic complete');
  console.log('\n💡 NEXT STEPS:');
  console.log('1. Check if Node 6 position matches expected position (600, 350)');
  console.log('2. Check if links connected to Node 6 start/end at correct port positions');
  console.log('3. Check if arrows are positioned correctly relative to link endpoints');
  console.log('4. Try dragging Node 6 and watch console for reroute messages');
}

// Auto-run
diagnoseElkComparison();

export {};
