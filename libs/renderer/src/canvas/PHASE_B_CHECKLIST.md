# Canvas Renderer - Phase B Implementation Checklist

## Overview

This document outlines the tasks required to implement the full Canvas Renderer in Phase B. The current Phase A implementation is a stub that throws "not implemented" errors for all methods.

**Current Status**: Phase A stub complete with 100% test coverage
**Target**: Full Canvas 2D rendering implementation
**Timeline**: Phase B (TBD)

---

## Core Rendering Implementation

### 1. Canvas Context Setup
- [ ] Create canvas element and attach to container
- [ ] Get 2D rendering context
- [ ] Configure context settings (imageSmoothingEnabled, etc.)
- [ ] Handle retina/high-DPI displays (devicePixelRatio)
- [ ] Implement resize handling

**Files to modify:**
- `libs/renderer/src/canvas/canvas-renderer.stub.ts` → `canvas-renderer.ts`

### 2. Initialize Method
- [ ] Validate container element
- [ ] Create main canvas element
- [ ] Create offscreen canvas (if enableOffscreen)
- [ ] Create hit detection canvas (if enableHitDetection)
- [ ] Set up event listeners (resize, etc.)
- [ ] Initialize internal state

**Success Criteria:**
- Canvas element created and attached to DOM
- Context initialized with correct settings
- Multiple calls throw error (already initialized)

### 3. Render Method
- [ ] Implement VNode traversal
- [ ] Map VNode types to canvas operations:
  - [ ] `rect` → `ctx.fillRect()` / `ctx.strokeRect()`
  - [ ] `circle` → `ctx.arc()`
  - [ ] `path` → `ctx.moveTo()` / `ctx.lineTo()` / `ctx.bezierCurveTo()`
  - [ ] `line` → `ctx.moveTo()` / `ctx.lineTo()`
  - [ ] `text` → `ctx.fillText()` / `ctx.strokeText()`
  - [ ] `image` → `ctx.drawImage()`
  - [ ] `g` (group) → `ctx.save()` / `ctx.restore()` with transform
- [ ] Handle VNode props:
  - [ ] `fill` → `ctx.fillStyle`
  - [ ] `stroke` → `ctx.strokeStyle`
  - [ ] `strokeWidth` → `ctx.lineWidth`
  - [ ] `opacity` → `ctx.globalAlpha`
  - [ ] `transform` → `ctx.setTransform()`
  - [ ] `clip` → `ctx.clip()`
- [ ] Implement batched rendering (if options.batched)
- [ ] Implement offscreen rendering (if options.offscreen)
- [ ] Implement skipUnchanged optimization

**Success Criteria:**
- All VNode types render correctly
- Rendering matches SVG renderer output visually
- Performance: 60 FPS for 1000+ nodes

### 4. Update Method
- [ ] Parse update paths (e.g., "children.0.children.2")
- [ ] Find VNode at path in tree
- [ ] Apply incremental update (no full re-render)
- [ ] Only redraw affected region (dirty rectangle)
- [ ] Update hit detection canvas

**Success Criteria:**
- Incremental updates faster than full render
- No visual artifacts
- Hit detection remains accurate

---

## Measurement & Hit Testing

### 5. MeasureText Method
- [ ] Implement `ctx.measureText()` wrapper
- [ ] Apply font styling (family, size, weight, style)
- [ ] Calculate baseline from font metrics
- [ ] Cache measurements for performance
- [ ] Handle letter-spacing and line-height

**Success Criteria:**
- Text measurements accurate to ±1px
- Results match SVG renderer
- Cache improves performance

### 6. MeasureElement Method
- [ ] Render VNode to temporary canvas
- [ ] Calculate bounding box from drawn pixels
- [ ] Handle transforms (rotation, scale, skew)
- [ ] Cache results

**Success Criteria:**
- Bounding boxes accurate for all VNode types
- Performance: <5ms per measurement

### 7. HitTest Method
- [ ] Implement pixel-based hit detection:
  - [ ] Render nodes with unique colors to hit canvas
  - [ ] Read pixel at (x, y) coordinate
  - [ ] Map color back to VNode
- [ ] Alternative: Use `ctx.isPointInPath()` (slower but accurate)
- [ ] Handle transforms
- [ ] Consider strokeWidth for lines
- [ ] Z-index ordering (top-most element)

**Success Criteria:**
- Hit testing 100% accurate
- Performance: <1ms per test
- Works with nested groups and transforms

---

## Export & Advanced Features

### 8. Export Method
- [ ] Implement PNG export:
  - [ ] Use `canvas.toDataURL('image/png')`
  - [ ] Apply scale and quality options
  - [ ] Handle transparency
- [ ] Implement JPEG export:
  - [ ] Use `canvas.toDataURL('image/jpeg', quality)`
  - [ ] Apply backgroundColor (JPEG doesn't support transparency)
- [ ] Implement WebP export:
  - [ ] Check browser support
  - [ ] Use `canvas.toDataURL('image/webp', quality)`
- [ ] Implement SVG export:
  - [ ] Convert canvas to SVG using canvas2svg library
  - [ ] Or fall back to raster image embedded in SVG

**Success Criteria:**
- All formats produce valid images
- Quality and scale options work correctly
- File sizes reasonable

### 9. Clear Method
- [ ] Clear main canvas: `ctx.clearRect(0, 0, width, height)`
- [ ] Clear hit detection canvas
- [ ] Clear offscreen canvas
- [ ] Reset state

**Success Criteria:**
- Canvas completely cleared
- No memory leaks

### 10. Destroy Method
- [ ] Remove canvas elements from DOM
- [ ] Clear event listeners
- [ ] Release WebGL context (if using WebGL)
- [ ] Clear caches
- [ ] Set internal state to null

**Success Criteria:**
- No memory leaks
- Can be called multiple times safely
- DOM cleaned up

---

## Capabilities Update

### 11. Update RendererCapabilities
Current (Phase A stub):
```typescript
{
  supportsHitTest: false,
  supportsBatching: true,
  supportsExport: false,
  supportsMeasurement: false,
  supportsForeignObject: false, // Canvas doesn't support this
  supportsFilters: false,
  supportsOffscreen: true,
}
```

Phase B targets:
```typescript
{
  supportsHitTest: true,      // ✅ Implement pixel-based hit detection
  supportsBatching: true,      // ✅ Already true
  supportsExport: true,        // ✅ PNG, JPEG, WebP export
  supportsMeasurement: true,   // ✅ measureText, measureElement
  supportsForeignObject: false, // ❌ Canvas doesn't support HTML embedding
  supportsFilters: true,       // ✅ Canvas filters (blur, brightness, etc.)
  supportsOffscreen: true,     // ✅ Already true
}
```

---

## Testing

### 12. Unit Tests
- [ ] Test all IRenderer methods
- [ ] Test CanvasRendererConfig options
- [ ] Test error handling (invalid container, etc.)
- [ ] Test lifecycle (initialize → render → destroy)
- [ ] Test memory management

**Target**: 100% code coverage

### 13. Integration Tests
- [ ] Render complex diagrams
- [ ] Compare output with SVG renderer
- [ ] Test performance (1000+ nodes)
- [ ] Test hit testing accuracy
- [ ] Test export quality

### 14. Visual Regression Tests
- [ ] Snapshot tests for common diagram patterns
- [ ] Compare Canvas vs SVG output pixel-by-pixel
- [ ] Tolerance for anti-aliasing differences

---

## Performance Optimization

### 15. Rendering Optimizations
- [ ] Implement dirty rectangle tracking
- [ ] Implement VNode diffing (skip unchanged)
- [ ] Implement view frustum culling (only render visible nodes)
- [ ] Implement LOD (Level of Detail) rendering
- [ ] Use OffscreenCanvas for worker thread rendering
- [ ] Implement object pooling for geometries

**Performance Targets:**
- 1000 nodes @ 60 FPS
- 10,000 nodes @ 30 FPS
- Update latency < 16ms

### 16. Memory Optimization
- [ ] Implement texture atlasing for repeated graphics
- [ ] Clear unused cached measurements
- [ ] Limit hit detection canvas resolution
- [ ] Use typed arrays for geometry data

---

## Documentation

### 17. API Documentation
- [ ] Document all public methods with JSDoc
- [ ] Add usage examples
- [ ] Document configuration options
- [ ] Document performance characteristics

### 18. Migration Guide
- [ ] Document differences from SVG renderer
- [ ] When to use Canvas vs SVG
- [ ] Configuration best practices
- [ ] Known limitations

---

## Factory Registration

### 19. Register with RendererFactory
```typescript
import { RendererFactory } from '../core/renderer-factory';
import { CanvasRenderer } from './canvas-renderer';

// Register Canvas renderer
RendererFactory.registerRenderer('canvas', CanvasRenderer);
```

- [ ] Add registration to `libs/renderer/src/canvas/index.ts`
- [ ] Add to default registrations in RendererStrategyManager
- [ ] Update documentation

---

## Dependencies

### External Libraries (Optional)
- [ ] `canvas2svg` - For SVG export from Canvas
- [ ] `offscreen-canvas` - Polyfill for older browsers
- [ ] `gl-matrix` - Fast matrix math for transforms

---

## Phase B Milestones

### Milestone 1: Basic Rendering (Week 1-2)
- ✅ Initialize method
- ✅ Render method (basic shapes: rect, circle, line)
- ✅ Clear method
- ✅ Destroy method

### Milestone 2: Advanced Rendering (Week 3-4)
- ✅ All VNode types (path, text, image)
- ✅ Transforms and clipping
- ✅ Groups with save/restore
- ✅ Batched rendering

### Milestone 3: Measurement & Hit Testing (Week 5-6)
- ✅ MeasureText method
- ✅ MeasureElement method
- ✅ HitTest method (pixel-based)

### Milestone 4: Export & Polish (Week 7-8)
- ✅ Export method (PNG, JPEG, WebP)
- ✅ Performance optimizations
- ✅ Full test coverage
- ✅ Documentation

---

## Known Limitations

These are inherent to Canvas and will NOT be implemented:

1. **No foreignObject support** - Canvas cannot embed HTML/SVG content
   - Workaround: Render text/images only
   - For HTML components, use SVG renderer with foreignObject

2. **No CSS styling** - Canvas uses programmatic API only
   - All styling must be in VNode props
   - Cannot use CSS classes or stylesheets

3. **Accessibility** - Canvas content not accessible to screen readers
   - Recommendation: Provide alternative representation

4. **Browser printing** - Canvas may not print as crisply as SVG
   - Workaround: Export to PNG at high resolution

---

## Success Criteria

Phase B is complete when:

✅ All IRenderer methods implemented
✅ 100% test coverage
✅ Performance targets met (1000 nodes @ 60 FPS)
✅ Hit testing 100% accurate
✅ Export produces valid images
✅ No memory leaks
✅ Documentation complete
✅ Visual parity with SVG renderer (within anti-aliasing tolerance)
✅ Integration tests passing

---

## Related Files

- `libs/renderer/src/canvas/canvas-renderer.stub.ts` - Current stub
- `libs/renderer/src/canvas/canvas-renderer.stub.spec.ts` - Stub tests
- `libs/renderer/src/core/renderer.interface.ts` - Interface definition
- `libs/renderer/src/svg/svg-renderer.ts` - Reference implementation
- `libs/renderer/src/core/renderer-factory.ts` - Factory registration

---

**Phase A Status**: ✅ Complete (Stub + Tests)
**Phase B Status**: 📋 Planned
**Last Updated**: 2025-10-24
