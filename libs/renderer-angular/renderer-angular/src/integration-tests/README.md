# Integration Tests - renderer-angular

Comprehensive integration tests for the renderer-angular library.

## Overview

This test suite provides end-to-end integration testing covering all major components and services working together. The tests verify complete workflows, data flow, and system behavior under realistic conditions.

## Test Coverage

### Test Utilities (`utils/`)

- **TestDiagramBuilder**: Fluent API for building test diagrams
- **MockHttpServer**: Mock HTTP server for API testing
- **MockRenderer**: Configurable mock renderer with tracking

### Test Suites (`suites/`)

#### 1. Property Panel Integration (`property-panel.integration.spec.ts`)
**8 scenarios**, covering:
- Single node property editing
- Multi-node editing with mixed values
- Conditional properties (show/hide based on other properties)
- Deferred update mode (batch changes)
- Property groups and sections
- Schema updates and re-rendering
- Error handling and recovery
- Performance with many properties

#### 2. Component Rendering Integration (`component-rendering.integration.spec.ts`)
**8 scenarios**, covering:
- Basic VNode rendering
- Dynamic component creation
- Incremental rendering and updates
- Large diagram performance (500-1000+ nodes)
- Memory management and cleanup
- Error handling and resilience
- Nested component hierarchies
- Multi-renderer support

#### 3. Data Binding Integration (`data-binding.integration.spec.ts`)
**8 scenarios**, covering:
- Two-way data binding (canvas ↔ property panel)
- Observable data streams
- Event propagation chains
- State synchronization
- Real-time updates
- Complex data flow (multi-node editing)
- Data validation during binding
- Memory and performance under load

#### 4. Mode-Aware Integration (`mode-aware.integration.spec.ts`)
**8 scenarios**, covering:
- Basic mode transitions (Design ↔ Debug ↔ Simulation)
- Mode guards and validation
- Mode-specific features (debug tracking, simulation)
- State preservation across modes
- Mode analytics (time tracking)
- Mode transition hooks
- Complex mode workflows
- Error recovery

#### 5. Renderer Switching Integration (`renderer-switching.integration.spec.ts`)
**8 scenarios**, covering:
- Manual renderer switching
- Automatic renderer selection (based on diagram size)
- Performance-based switching
- Renderer capabilities detection
- Edge cases and error handling
- Renderer synchronization (UI ↔ service)
- Complex diagrams
- Memory and resource management

#### 6. Full Workflow Integration (`full-workflow.integration.spec.ts`)
**5 workflows**, covering:
- Complete diagram authoring (add, edit, delete, move nodes)
- Debug and simulation workflow (breakpoints, execution tracking)
- Renderer optimization workflow (performance-based selection)
- Real-world usage scenarios (rapid interactions, error handling)
- Performance under load (500+ nodes, complex operations)

## Total Test Coverage

- **45+ integration test scenarios**
- **All major components tested together**
- **Real-world workflows validated**
- **Performance benchmarks included**
- **Memory leak detection**

## Running Tests

### Run All Integration Tests
```bash
npx nx test renderer-angular-renderer-angular --testPathPattern="integration-tests"
```

### Run Specific Suite
```bash
# Property panel tests
npx nx test renderer-angular-renderer-angular --testPathPattern="property-panel.integration"

# Component rendering tests
npx nx test renderer-angular-renderer-angular --testPathPattern="component-rendering.integration"

# Data binding tests
npx nx test renderer-angular-renderer-angular --testPathPattern="data-binding.integration"

# Mode-aware tests
npx nx test renderer-angular-renderer-angular --testPathPattern="mode-aware.integration"

# Renderer switching tests
npx nx test renderer-angular-renderer-angular --testPathPattern="renderer-switching.integration"

# Full workflow tests
npx nx test renderer-angular-renderer-angular --testPathPattern="full-workflow.integration"
```

### Run with Coverage
```bash
npx nx test renderer-angular-renderer-angular --coverage --testPathPattern="integration-tests"
```

### Run with Verbose Output
```bash
npx nx test renderer-angular-renderer-angular --verbose --testPathPattern="integration-tests"
```

## Performance Benchmarks

Integration tests include performance benchmarks:

- **Small diagrams (< 100 nodes)**: < 50ms render time
- **Medium diagrams (100-500 nodes)**: < 200ms render time
- **Large diagrams (500-1000 nodes)**: < 500ms render time
- **Very large diagrams (1000+ nodes)**: < 2000ms render time

Tests will fail if performance thresholds are exceeded.

## Memory Leak Detection

Several tests specifically check for memory leaks:

- Repeated render/clear cycles
- Multiple component creation/destruction
- Rapid mode switching
- Renderer switching cycles
- Large dataset processing

Tests monitor component counts and ensure proper cleanup.

## Test Utilities API

### TestDiagramBuilder

```typescript
const diagram = new TestDiagramBuilder()
  .addNode('node1', { x: 0, y: 0, width: 100, height: 100, label: 'Start' })
  .addNode('node2', { x: 200, y: 0, width: 100, height: 100, label: 'End' })
  .addEdge('edge1', 'node1', 'node2')
  .build();

// Or use prebuilt diagrams
const simple = TestDiagramBuilder.createSimpleFlowchart();
const complex = TestDiagramBuilder.createComplexDiagram();
const large = TestDiagramBuilder.createLargeDiagram(1000);
```

### MockHttpServer

```typescript
const server = new MockHttpServer();
server.onGet('/api/diagrams', [{ id: 1, name: 'Test' }]);
server.onPost('/api/diagrams', (req) => ({ id: 2, ...req.body }));

const response = await server.request('GET', '/api/diagrams');
```

### MockRenderer

```typescript
const renderer = new MockRenderer('svg');
renderer.setRenderDelay(10); // Simulate slow rendering
await renderer.render(vnode);

expect(renderer.renderCount).toBe(1);
expect(renderer.getAverageRenderTime()).toBeLessThan(50);
```

## Contributing

When adding new integration tests:

1. Create descriptive scenario names
2. Include performance assertions
3. Test error conditions
4. Verify memory cleanup
5. Document expected behavior
6. Use the provided test utilities

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:

- No external dependencies required
- Deterministic behavior (no flaky tests)
- Fast execution (< 5 minutes total)
- Clear failure messages
- Automatic retry on transient failures

## Troubleshooting

### Tests Timing Out
Increase Jest timeout in jest.config.js:
```javascript
testTimeout: 30000 // 30 seconds
```

### Memory Issues
Run tests with increased memory:
```bash
NODE_OPTIONS=--max_old_space_size=4096 npx nx test ...
```

### Flaky Tests
Check for:
- Async operations not properly awaited
- Insufficient `fixture.detectChanges()` calls
- Race conditions in observables
- Timing-dependent assertions

## Support

For issues or questions about integration tests, please:
1. Check this README
2. Review test suite comments
3. Create an issue with test logs
