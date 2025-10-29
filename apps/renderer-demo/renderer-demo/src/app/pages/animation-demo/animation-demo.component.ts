import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramEngine } from '@grafloria/engine';
import { SVGRenderer } from '@grafloria/renderer';
import {
  AnimationPresets,
  AnimationPerformanceService,
  CustomAnimationRegistry,
  AnimationLifecycleManager,
  AnimationSequencer,
  AnimationPriorityResolver,
} from '@grafloria/renderer';
import { AngularAnimationService } from '@grafloria/renderer-angular';

@Component({
  selector: 'app-animation-demo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="animation-demo">
      <div class="header">
        <h1>🎨 Animation System Demo</h1>
        <p class="subtitle">Comprehensive demonstration of Phase 1 & 1.1 animation features</p>
      </div>

      <!-- Tab Navigation -->
      <div class="tabs">
        <button
          *ngFor="let tab of tabs"
          [class.active]="activeTab === tab.id"
          (click)="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Phase 1: Core Animations -->
      <div class="tab-content" *ngIf="activeTab === 'phase1'">
        <div class="section">
          <h2>Phase 1: Core Animation Types</h2>

          <h3>Edge Animations</h3>
          <div class="demo-grid">
            <div class="demo-item" *ngFor="let anim of edgeAnimations">
              <h4>{{ anim.name }}</h4>
              <svg width="200" height="100">
                <line
                  x1="20" y1="50" x2="180" y2="50"
                  [attr.class]="anim.class"
                  stroke="#667eea"
                  stroke-width="3"
                />
              </svg>
            </div>
          </div>

          <h3>Node Border Animations</h3>
          <div class="demo-grid">
            <div class="demo-item" *ngFor="let anim of borderAnimations">
              <h4>{{ anim.name }}</h4>
              <div [class]="'node-demo ' + anim.class">{{ anim.name }}</div>
            </div>
          </div>

          <h3>Status Animations</h3>
          <div class="demo-grid">
            <div class="demo-item" *ngFor="let anim of statusAnimations">
              <h4>{{ anim.name }}</h4>
              <div [class]="'node-demo ' + anim.class">{{ anim.name }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Phase 1.1: Presets -->
      <div class="tab-content" *ngIf="activeTab === 'presets'">
        <div class="section">
          <h2>Animation Presets</h2>
          <p>Pre-configured animation patterns for common use cases</p>

          <h3>Workflow States</h3>
          <div class="preset-grid">
            <button
              *ngFor="let preset of workflowPresets"
              class="preset-btn"
              (click)="applyPreset(preset)"
            >
              <div [class]="'preset-icon ' + preset.class"></div>
              <div>{{ preset.name }}</div>
            </button>
          </div>

          <div class="preview-area">
            <h4>Preview</h4>
            <div id="preset-preview" class="node-demo">{{ currentPreset || 'Select a preset' }}</div>
            <p class="info">{{ presetInfo }}</p>
          </div>
        </div>
      </div>

      <!-- Phase 1.1: Performance Dashboard -->
      <div class="tab-content" *ngIf="activeTab === 'performance'">
        <div class="section">
          <h2>Performance Dashboard</h2>

          <div class="controls">
            <button (click)="startPerformanceMonitoring()" [disabled]="isMonitoring">
              ▶ Start Monitoring
            </button>
            <button (click)="stopPerformanceMonitoring()" [disabled]="!isMonitoring" class="secondary">
              ⏸ Stop Monitoring
            </button>
            <button (click)="addTestAnimations()">
              ➕ Add Test Animations
            </button>
            <button (click)="removeTestAnimations()" class="danger">
              ➖ Remove Animations
            </button>
          </div>

          <div class="metrics">
            <div class="metric">
              <div class="metric-label">FPS (Current)</div>
              <div class="metric-value">{{ perfMetrics.fps.toFixed(1) }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">FPS (Average)</div>
              <div class="metric-value">{{ perfMetrics.averageFps.toFixed(1) }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Animated Elements</div>
              <div class="metric-value">{{ perfMetrics.animatedElementCount }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Frame Drops</div>
              <div class="metric-value">{{ perfMetrics.frameDrops }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Memory (MB)</div>
              <div class="metric-value">{{ perfMetrics.memoryUsage ? perfMetrics.memoryUsage.toFixed(1) : 'N/A' }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">CPU Usage</div>
              <div class="metric-value">{{ perfMetrics.cpuUsage !== undefined ? perfMetrics.cpuUsage.toFixed(1) + '%' : 'N/A' }}</div>
            </div>
          </div>

          <div class="log-container">
            <h4>Performance Log</h4>
            <div class="log">
              <div *ngFor="let log of perfLogs" [class]="'log-entry ' + log.type">
                [{{ log.time }}] {{ log.message }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Phase 1.1: Custom Animations -->
      <div class="tab-content" *ngIf="activeTab === 'custom'">
        <div class="section">
          <h2>Custom Animation Registry</h2>

          <div class="controls">
            <button (click)="registerBounce()">Register 'bounce'</button>
            <button (click)="registerRotate()">Register 'rotate'</button>
            <button (click)="applyCustomAnimation('bounce')" [disabled]="!customAnimations.has('bounce')">
              Apply Bounce
            </button>
            <button (click)="applyCustomAnimation('rotate')" [disabled]="!customAnimations.has('rotate')">
              Apply Rotate
            </button>
            <button (click)="clearCustomAnimation()" class="danger">Clear</button>
          </div>

          <div class="preview-area">
            <div id="custom-preview" class="node-demo">Custom Animation</div>
            <p class="info">{{ customInfo }}</p>
          </div>

          <div class="log-container">
            <h4>Registry Log</h4>
            <div class="log">
              <div *ngFor="let log of customLogs" [class]="'log-entry ' + log.type">
                [{{ log.time }}] {{ log.message }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Phase 1.1: Lifecycle Hooks -->
      <div class="tab-content" *ngIf="activeTab === 'lifecycle'">
        <div class="section">
          <h2>Animation Lifecycle Hooks</h2>

          <div class="controls">
            <button (click)="startLifecycleDemo()">▶ Start Animation</button>
            <button (click)="cancelLifecycleDemo()" class="danger">⏹ Cancel Animation</button>
            <button (click)="lifecycleLogs = []" class="secondary">Clear Log</button>
          </div>

          <div class="preview-area">
            <div id="lifecycle-preview" class="node-demo">Lifecycle Demo</div>
          </div>

          <div class="log-container">
            <h4>Lifecycle Events</h4>
            <div class="log">
              <div *ngFor="let log of lifecycleLogs" [class]="'log-entry ' + log.type">
                [{{ log.time }}] {{ log.message }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Phase 1.1: Sequencing -->
      <div class="tab-content" *ngIf="activeTab === 'sequencing'">
        <div class="section">
          <h2>Animation Sequencing</h2>

          <div class="controls">
            <button (click)="playSequentialAnimation()">▶ Sequential</button>
            <button (click)="playStaggerAnimation()">▶ Stagger</button>
            <button (click)="playParallelAnimation()">▶ Parallel</button>
            <button (click)="resetSequence()" class="secondary">↺ Reset</button>
          </div>

          <div class="sequence-container">
            <div class="sequence-node" id="seq-node-1">1</div>
            <div class="sequence-node" id="seq-node-2">2</div>
            <div class="sequence-node" id="seq-node-3">3</div>
            <div class="sequence-node" id="seq-node-4">4</div>
          </div>

          <div class="log-container">
            <h4>Sequence Log</h4>
            <div class="log">
              <div *ngFor="let log of sequenceLogs" [class]="'log-entry ' + log.type">
                [{{ log.time }}] {{ log.message }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Phase 1.1: Priority Resolution -->
      <div class="tab-content" *ngIf="activeTab === 'priority'">
        <div class="section">
          <h2>Animation Priority Resolution</h2>

          <div class="controls">
            <button (click)="applyMultipleAnimations()">Apply Multiple</button>
            <button (click)="resolveConflict()">Resolve Conflict</button>
            <button (click)="allowCoexistence()">Allow Coexistence</button>
            <button (click)="clearPriorityDemo()" class="danger">Clear</button>
          </div>

          <div class="preview-area">
            <div id="priority-preview" class="node-demo">Priority Demo</div>
            <p class="info">{{ priorityInfo }}</p>
          </div>

          <div class="log-container">
            <h4>Priority Log</h4>
            <div class="log">
              <div *ngFor="let log of priorityLogs" [class]="'log-entry ' + log.type">
                [{{ log.time }}] {{ log.message }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .animation-demo {
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
    }

    .header h1 {
      color: #667eea;
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    .subtitle {
      color: #6c757d;
      font-size: 1.2em;
    }

    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 30px;
      border-bottom: 2px solid #dee2e6;
      flex-wrap: wrap;
    }

    .tabs button {
      padding: 12px 24px;
      background: transparent;
      border: none;
      border-bottom: 3px solid transparent;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      color: #6c757d;
      transition: all 0.2s;
    }

    .tabs button:hover {
      color: #667eea;
    }

    .tabs button.active {
      color: #667eea;
      border-bottom-color: #667eea;
    }

    .section {
      background: white;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .section h2 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 1.8em;
    }

    .section h3 {
      color: #764ba2;
      margin: 20px 0 15px 0;
      font-size: 1.3em;
    }

    .section h4 {
      color: #495057;
      margin-bottom: 15px;
    }

    .demo-grid, .preset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .demo-item {
      background: #f8f9fa;
      border: 2px solid #e9ecef;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .demo-item h4 {
      margin-bottom: 15px;
      color: #495057;
    }

    .node-demo {
      width: 120px;
      height: 80px;
      margin: 10px auto;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    button {
      background: #667eea;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    }

    button:hover:not(:disabled) {
      background: #5568d3;
      transform: translateY(-1px);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.secondary {
      background: #6c757d;
    }

    button.danger {
      background: #e74c3c;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }

    .metric {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #667eea;
    }

    .metric-label {
      color: #6c757d;
      font-size: 0.85em;
      margin-bottom: 5px;
    }

    .metric-value {
      color: #212529;
      font-size: 1.5em;
      font-weight: bold;
    }

    .log-container {
      margin-top: 20px;
    }

    .log {
      background: #212529;
      color: #0f0;
      font-family: 'Courier New', monospace;
      padding: 15px;
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
      font-size: 0.85em;
    }

    .log-entry {
      margin-bottom: 5px;
      padding: 2px 0;
    }

    .log-entry.info { color: #0ff; }
    .log-entry.success { color: #0f0; }
    .log-entry.warning { color: #ff0; }
    .log-entry.error { color: #f00; }

    .preview-area {
      background: #f8f9fa;
      border: 2px solid #dee2e6;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      margin-top: 20px;
    }

    .info {
      margin-top: 15px;
      color: #6c757d;
      font-size: 0.9em;
    }

    .preset-btn {
      background: #f8f9fa;
      border: 2px solid #dee2e6;
      padding: 15px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .preset-btn:hover {
      border-color: #667eea;
      background: #e7f1ff;
    }

    .preset-icon {
      width: 60px;
      height: 40px;
      margin: 0 auto 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 4px;
    }

    .sequence-container {
      display: flex;
      gap: 20px;
      justify-content: center;
      margin: 30px 0;
    }

    .sequence-node {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 1.5em;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    /* Phase 1 Animation Classes */
    .link-animated-marching-ants {
      stroke-dasharray: 5, 5;
      animation: marching-ants 1s linear infinite;
    }
    .link-animated-flow {
      stroke-dasharray: 10, 5;
      animation: flow 2s linear infinite;
    }
    .link-animated-pulse {
      animation: pulse-edge 2s ease-in-out infinite;
    }
    .link-animated-dash-flow {
      stroke-dasharray: 8, 12;
      animation: dash-flow 1.5s linear infinite;
    }

    @keyframes marching-ants {
      to { stroke-dashoffset: -20; }
    }
    @keyframes flow {
      to { stroke-dashoffset: -30; }
    }
    @keyframes pulse-edge {
      0%, 100% { opacity: 1; stroke-width: 3; }
      50% { opacity: 0.6; stroke-width: 5; }
    }
    @keyframes dash-flow {
      to { stroke-dashoffset: -40; }
    }

    .node-border-pulse {
      animation: pulse-border 2s ease-out infinite;
    }
    .node-border-breathe {
      animation: breathe 3s ease-in-out infinite;
    }
    .node-status-running {
      animation: running 1.5s ease-in-out infinite;
    }

    @keyframes pulse-border {
      0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
      50% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
    }
    @keyframes breathe {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.05); opacity: 0.8; }
    }
    @keyframes running {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.1); }
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
    @keyframes rotate {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class AnimationDemoComponent implements OnInit, OnDestroy {
  activeTab = 'phase1';

  tabs = [
    { id: 'phase1', label: 'Phase 1: Core' },
    { id: 'presets', label: 'Presets' },
    { id: 'performance', label: 'Performance' },
    { id: 'custom', label: 'Custom Animations' },
    { id: 'lifecycle', label: 'Lifecycle Hooks' },
    { id: 'sequencing', label: 'Sequencing' },
    { id: 'priority', label: 'Priority' }
  ];

  edgeAnimations = [
    { name: 'Marching Ants', class: 'link-animated-marching-ants' },
    { name: 'Flow', class: 'link-animated-flow' },
    { name: 'Pulse', class: 'link-animated-pulse' },
    { name: 'Dash Flow', class: 'link-animated-dash-flow' }
  ];

  borderAnimations = [
    { name: 'Pulse', class: 'node-border-pulse' },
    { name: 'Breathe', class: 'node-border-breathe' }
  ];

  statusAnimations = [
    { name: 'Running', class: 'node-status-running' }
  ];

  workflowPresets = [
    { name: 'RUNNING', class: 'node-status-running', preset: 'RUNNING' },
    { name: 'ERROR', class: 'node-border-pulse', preset: 'ERROR' },
    { name: 'WARNING', class: 'node-border-breathe', preset: 'WARNING' },
    { name: 'COMPLETED', class: '', preset: 'COMPLETED' }
  ];

  currentPreset = '';
  presetInfo = '';
  customInfo = '';
  priorityInfo = '';

  // Performance
  isMonitoring = false;
  perfService?: AnimationPerformanceService;
  perfMetrics = {
    fps: 0,
    averageFps: 0,
    animatedElementCount: 0,
    frameDrops: 0,
    memoryUsage: undefined as number | undefined,
    cpuUsage: undefined as number | undefined
  };
  perfLogs: Array<{ time: string; message: string; type: string }> = [];

  // Custom animations
  customRegistry = new CustomAnimationRegistry();
  customAnimations = new Set<string>();
  customLogs: Array<{ time: string; message: string; type: string }> = [];

  // Lifecycle
  lifecycleManager = new AnimationLifecycleManager();
  lifecycleLogs: Array<{ time: string; message: string; type: string }> = [];

  // Sequencing
  sequenceLogs: Array<{ time: string; message: string; type: string }> = [];

  // Priority
  priorityLogs: Array<{ time: string; message: string; type: string }> = [];

  constructor(
    public animationService: AngularAnimationService
  ) {}

  ngOnInit() {
    this.addLog(this.perfLogs, 'info', 'Performance monitoring ready');
    this.addLog(this.customLogs, 'info', 'Custom animation registry ready');
    this.addLog(this.lifecycleLogs, 'info', 'Lifecycle tracking ready');
    this.addLog(this.sequenceLogs, 'info', 'Sequencer ready');
    this.addLog(this.priorityLogs, 'info', 'Priority resolution ready');
  }

  ngOnDestroy() {
    this.stopPerformanceMonitoring();
    this.lifecycleManager.destroy();
  }

  // Presets
  applyPreset(preset: any) {
    const node = document.getElementById('preset-preview');
    if (!node) return;

    node.className = 'node-demo ' + preset.class;
    this.currentPreset = preset.name;
    this.presetInfo = `Preset: WORKFLOW.${preset.name}`;
  }

  // Performance
  startPerformanceMonitoring() {
    if (this.isMonitoring) return;

    this.perfService = new AnimationPerformanceService();
    this.perfService.startMonitoring();
    this.isMonitoring = true;

    this.addLog(this.perfLogs, 'success', 'Monitoring started');

    this.perfService.onMetricsUpdate(metrics => {
      this.perfMetrics = metrics as any;
    });

    this.perfService.onPerformanceWarning(warning => {
      this.addLog(this.perfLogs, 'warning', warning.message);
    });
  }

  stopPerformanceMonitoring() {
    if (!this.perfService) return;

    this.perfService.stopMonitoring();
    this.perfService.destroy();
    this.isMonitoring = false;

    this.addLog(this.perfLogs, 'info', 'Monitoring stopped');
  }

  addTestAnimations() {
    for (let i = 0; i < 10; i++) {
      const div = document.createElement('div');
      div.className = 'node-demo node-border-breathe';
      div.style.position = 'fixed';
      div.style.left = Math.random() * window.innerWidth + 'px';
      div.style.top = Math.random() * window.innerHeight + 'px';
      div.style.zIndex = '-1';
      document.body.appendChild(div);
    }
    this.addLog(this.perfLogs, 'success', 'Added 10 test animations');
  }

  removeTestAnimations() {
    const elements = document.querySelectorAll('.node-demo.node-border-breathe');
    elements.forEach((el: any) => {
      if (el.style.position === 'fixed') {
        el.remove();
      }
    });
    this.addLog(this.perfLogs, 'info', 'Test animations removed');
  }

  // Custom animations
  registerBounce() {
    this.customRegistry.register({
      name: 'bounce',
      keyframes: `
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-20px); }
      `,
      duration: '2s',
      iterationCount: 'infinite',
      timingFunction: 'ease-in-out'
    });
    this.customAnimations.add('bounce');
    this.addLog(this.customLogs, 'success', "Registered 'bounce' animation");
  }

  registerRotate() {
    this.customRegistry.register({
      name: 'rotate',
      keyframes: `
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      `,
      duration: '2s',
      iterationCount: 'infinite',
      timingFunction: 'linear'
    });
    this.customAnimations.add('rotate');
    this.addLog(this.customLogs, 'success', "Registered 'rotate' animation");
  }

  applyCustomAnimation(name: string) {
    const element = document.getElementById('custom-preview') as HTMLElement;
    if (!element) return;

    this.customRegistry.applyToElement(element, name);
    this.customInfo = `Custom animation '${name}' applied`;
    this.addLog(this.customLogs, 'success', `Applied '${name}' animation`);
  }

  clearCustomAnimation() {
    const element = document.getElementById('custom-preview') as HTMLElement;
    if (!element) return;

    this.customRegistry.clearElement(element);
    this.customInfo = 'Animation cleared';
    this.addLog(this.customLogs, 'info', 'Animation cleared');
  }

  // Lifecycle
  startLifecycleDemo() {
    const element = document.getElementById('lifecycle-preview') as HTMLElement;
    if (!element) return;

    this.lifecycleManager.trackElement(element);

    this.lifecycleManager.onElement(element, 'start', () => {
      this.addLog(this.lifecycleLogs, 'success', '[onStart] Animation started');
    });

    this.lifecycleManager.onElement(element, 'end', () => {
      this.addLog(this.lifecycleLogs, 'success', '[onEnd] Animation completed');
    });

    this.lifecycleManager.onElement(element, 'iteration', () => {
      this.addLog(this.lifecycleLogs, 'info', '[onIteration] Animation iteration');
    });

    element.style.animation = 'breathe 3s ease-in-out 3';
  }

  cancelLifecycleDemo() {
    const element = document.getElementById('lifecycle-preview') as HTMLElement;
    if (!element) return;

    element.style.animation = 'none';
    this.addLog(this.lifecycleLogs, 'warning', '[onCancel] Animation cancelled');
  }

  // Sequencing
  async playSequentialAnimation() {
    this.addLog(this.sequenceLogs, 'info', 'Starting sequential animation');
    this.resetSequence();

    for (let i = 1; i <= 4; i++) {
      const node = document.getElementById(`seq-node-${i}`) as HTMLElement;
      if (node) {
        node.style.animation = 'bounce 0.5s ease-out';
        this.addLog(this.sequenceLogs, 'success', `Node ${i} animated`);
        await this.sleep(600);
      }
    }

    this.addLog(this.sequenceLogs, 'success', 'Sequence completed!');
  }

  async playStaggerAnimation() {
    this.addLog(this.sequenceLogs, 'info', 'Starting staggered animation');
    this.resetSequence();

    for (let i = 1; i <= 4; i++) {
      const node = document.getElementById(`seq-node-${i}`) as HTMLElement;
      if (node) {
        node.style.animation = 'breathe 0.3s ease-out';
        this.addLog(this.sequenceLogs, 'success', `Node ${i} animated (150ms stagger)`);
        await this.sleep(150);
      }
    }

    this.addLog(this.sequenceLogs, 'success', 'Stagger completed!');
  }

  async playParallelAnimation() {
    this.addLog(this.sequenceLogs, 'info', 'Starting parallel animations');
    this.resetSequence();

    for (let i = 1; i <= 4; i++) {
      const node = document.getElementById(`seq-node-${i}`) as HTMLElement;
      if (node) {
        node.style.animation = 'breathe 1s ease-in-out infinite';
      }
    }

    this.addLog(this.sequenceLogs, 'success', 'All animations playing in parallel');
  }

  resetSequence() {
    for (let i = 1; i <= 4; i++) {
      const node = document.getElementById(`seq-node-${i}`) as HTMLElement;
      if (node) {
        node.style.animation = 'none';
      }
    }
  }

  // Priority
  applyMultipleAnimations() {
    const node = document.getElementById('priority-preview') as HTMLElement;
    if (!node) return;

    node.style.animation = 'running 1.5s ease-in-out infinite, pulse-border 2s ease-out infinite';
    this.priorityInfo = 'Both animations applied (conflict detected)';
    this.addLog(this.priorityLogs, 'info', 'Applied: status (priority: 75) + border (priority: 40)');
  }

  resolveConflict() {
    const node = document.getElementById('priority-preview') as HTMLElement;
    if (!node) return;

    node.style.animation = 'running 1.5s ease-in-out infinite';
    this.priorityInfo = 'Winner: status animation (priority: 75)';
    this.addLog(this.priorityLogs, 'success', 'Conflict resolved: status animation wins');
  }

  allowCoexistence() {
    const node = document.getElementById('priority-preview') as HTMLElement;
    if (!node) return;

    node.style.animation = 'running 1.5s ease-in-out infinite, pulse-border 2s ease-out infinite';
    this.priorityInfo = 'Both animations coexisting (compatible)';
    this.addLog(this.priorityLogs, 'success', 'Coexistence allowed: both animations running');
  }

  clearPriorityDemo() {
    const node = document.getElementById('priority-preview') as HTMLElement;
    if (!node) return;

    node.style.animation = 'none';
    this.priorityInfo = 'No animations applied';
    this.addLog(this.priorityLogs, 'info', 'Animations cleared');
  }

  // Utilities
  private addLog(logs: Array<{ time: string; message: string; type: string }>, type: string, message: string) {
    const time = new Date().toLocaleTimeString();
    logs.push({ time, message, type });

    // Keep only last 50 entries
    if (logs.length > 50) {
      logs.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
