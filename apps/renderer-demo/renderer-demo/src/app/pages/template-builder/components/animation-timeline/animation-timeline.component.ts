import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Animation keyframe
 */
export interface Keyframe {
  id: string;
  time: number; // 0-100 (percentage)
  properties: Record<string, any>;
}

/**
 * Animation configuration
 */
export interface AnimationConfig {
  id: string;
  name: string;
  duration: number; // milliseconds
  delay: number; // milliseconds
  iterations: number | 'infinite';
  direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  timingFunction: string;
  fillMode: 'none' | 'forwards' | 'backwards' | 'both';
  keyframes: Keyframe[];
  enabled: boolean;
}

/**
 * Animation Timeline Component
 *
 * A visual animation timeline editor with:
 * - Keyframe management (add, edit, delete, reorder)
 * - Visual timeline with playhead
 * - Property animation (transform, opacity, colors, etc.)
 * - Timing function presets (ease, linear, cubic-bezier)
 * - Animation presets (fade, slide, scale, rotate, bounce)
 * - Play/pause/reset controls
 * - Duration and delay configuration
 * - Iteration count (1, 2, 3, infinite)
 * - Direction control (normal, reverse, alternate)
 * - Fill mode configuration
 * - CSS @keyframes output
 *
 * Usage:
 * ```html
 * <app-animation-timeline
 *   [animations]="animationConfigs"
 *   (animationsChange)="onAnimationsChange($event)">
 * </app-animation-timeline>
 * ```
 */
@Component({
  selector: 'app-animation-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="timeline-editor" [style.font-family]="tokens.typography.fontFamily">
      <!-- Header -->
      <div class="editor-header">
        <h3>Animation Timeline</h3>
        <button class="add-btn" (click)="addAnimation()">
          + Add Animation
        </button>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="animations.length === 0">
        <div class="empty-icon">🎬</div>
        <div class="empty-text">No animations configured</div>
        <button class="add-animation-btn" (click)="addAnimation()">
          Create Animation
        </button>
      </div>

      <!-- Animation List -->
      <div class="animations-list" *ngIf="animations.length > 0">
        <div
          *ngFor="let animation of animations; let i = index; trackBy: trackByAnimationId"
          class="animation-card"
          [class.disabled]="!animation.enabled"
        >
          <!-- Animation Header -->
          <div class="animation-header">
            <div class="animation-title">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  [(ngModel)]="animation.enabled"
                  (change)="emitChange()"
                />
                <input
                  type="text"
                  [(ngModel)]="animation.name"
                  (input)="emitChange()"
                  class="name-input"
                  placeholder="Animation Name"
                />
              </label>
            </div>
            <div class="animation-actions">
              <button class="icon-btn" (click)="playAnimation(animation)" title="Play">
                ▶
              </button>
              <button class="icon-btn" (click)="duplicateAnimation(animation)" title="Duplicate">
                ⧉
              </button>
              <button class="icon-btn delete" (click)="deleteAnimation(i)" title="Delete">
                ×
              </button>
            </div>
          </div>

          <!-- Animation Settings -->
          <div class="animation-settings" *ngIf="animation.enabled">
            <!-- Timing Settings -->
            <div class="settings-grid">
              <!-- Duration -->
              <div class="setting-item">
                <label>Duration</label>
                <div class="input-group">
                  <input
                    type="number"
                    min="0"
                    [(ngModel)]="animation.duration"
                    (input)="emitChange()"
                    class="number-input"
                  />
                  <span class="unit">ms</span>
                </div>
              </div>

              <!-- Delay -->
              <div class="setting-item">
                <label>Delay</label>
                <div class="input-group">
                  <input
                    type="number"
                    min="0"
                    [(ngModel)]="animation.delay"
                    (input)="emitChange()"
                    class="number-input"
                  />
                  <span class="unit">ms</span>
                </div>
              </div>

              <!-- Iterations -->
              <div class="setting-item">
                <label>Iterations</label>
                <select [(ngModel)]="animation.iterations" (change)="emitChange()" class="select-input">
                  <option [ngValue]="1">1</option>
                  <option [ngValue]="2">2</option>
                  <option [ngValue]="3">3</option>
                  <option [ngValue]="5">5</option>
                  <option value="infinite">Infinite</option>
                </select>
              </div>

              <!-- Direction -->
              <div class="setting-item">
                <label>Direction</label>
                <select [(ngModel)]="animation.direction" (change)="emitChange()" class="select-input">
                  <option value="normal">Normal</option>
                  <option value="reverse">Reverse</option>
                  <option value="alternate">Alternate</option>
                  <option value="alternate-reverse">Alternate Reverse</option>
                </select>
              </div>
            </div>

            <!-- Timing Function -->
            <div class="setting-group">
              <label>Timing Function</label>
              <div class="timing-buttons">
                <button
                  *ngFor="let tf of timingFunctions"
                  class="timing-btn"
                  [class.active]="animation.timingFunction === tf.value"
                  (click)="animation.timingFunction = tf.value; emitChange()"
                  [title]="tf.name"
                >
                  {{ tf.name }}
                </button>
              </div>
            </div>

            <!-- Fill Mode -->
            <div class="setting-group">
              <label>Fill Mode</label>
              <select [(ngModel)]="animation.fillMode" (change)="emitChange()" class="select-input">
                <option value="none">None</option>
                <option value="forwards">Forwards</option>
                <option value="backwards">Backwards</option>
                <option value="both">Both</option>
              </select>
            </div>

            <!-- Timeline -->
            <div class="timeline-section">
              <div class="timeline-header">
                <label>Keyframes ({{ animation.keyframes.length }})</label>
                <button class="add-keyframe-btn" (click)="addKeyframe(animation)">
                  + Add Keyframe
                </button>
              </div>

              <!-- Timeline Bar -->
              <div class="timeline-bar">
                <div class="timeline-track">
                  <div
                    *ngFor="let keyframe of animation.keyframes; trackBy: trackByKeyframeId"
                    class="keyframe-marker"
                    [style.left.%]="keyframe.time"
                    (click)="selectKeyframe(animation, keyframe)"
                    [class.selected]="selectedKeyframe?.id === keyframe.id"
                    [title]="'At ' + keyframe.time + '%'"
                  >
                    <div class="keyframe-dot"></div>
                    <div class="keyframe-label">{{ keyframe.time }}%</div>
                  </div>
                </div>
                <div class="timeline-labels">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              <!-- Selected Keyframe Editor -->
              <div class="keyframe-editor" *ngIf="selectedKeyframe && selectedAnimation?.id === animation.id">
                <div class="keyframe-editor-header">
                  <span class="keyframe-title">Keyframe at {{ selectedKeyframe.time }}%</span>
                  <button class="icon-btn delete" (click)="deleteKeyframe(animation)" title="Delete">
                    ×
                  </button>
                </div>

                <!-- Time Slider -->
                <div class="setting-group">
                  <label>Time Position</label>
                  <div class="slider-control">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      [(ngModel)]="selectedKeyframe.time"
                      (input)="emitChange()"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      [(ngModel)]="selectedKeyframe.time"
                      (input)="emitChange()"
                      class="number-input"
                    />
                    <span class="unit">%</span>
                  </div>
                </div>

                <!-- Properties -->
                <div class="setting-group">
                  <label>Properties (JSON)</label>
                  <textarea
                    [(ngModel)]="keyframePropertiesJson[selectedKeyframe.id]"
                    (input)="updateKeyframeProperties(selectedKeyframe)"
                    placeholder='{ "transform": "translateX(100px)", "opacity": 0.5 }'
                    class="json-textarea"
                    rows="4"
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Animation Presets -->
      <div class="presets-section" *ngIf="animations.length > 0">
        <label class="section-label">Animation Presets</label>
        <div class="presets-grid">
          <button
            *ngFor="let preset of presets"
            class="preset-btn"
            (click)="applyPreset(preset)"
            [title]="preset.description"
          >
            <div class="preset-icon">{{ preset.icon }}</div>
            <div class="preset-name">{{ preset.name }}</div>
          </button>
        </div>
      </div>

      <!-- CSS Output -->
      <div class="code-section">
        <div class="code-header">
          <span>Generated CSS</span>
          <button class="copy-btn" (click)="copyCSSToClipboard()" title="Copy CSS">
            📋
          </button>
        </div>
        <pre class="code-output">{{ generateCSS() }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .timeline-editor {
      padding: 16px;
      background: white;
      border-radius: 8px;
      max-height: 90vh;
      overflow-y: auto;
      width: 100%;
      max-width: 700px;
    }

    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .editor-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .add-btn {
      padding: 8px 16px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .add-btn:hover {
      background: #5568d3;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: #999;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 14px;
      margin-bottom: 16px;
    }

    .add-animation-btn {
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .add-animation-btn:hover {
      background: #5568d3;
    }

    .animations-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .animation-card {
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      transition: all 0.2s;
    }

    .animation-card.disabled {
      opacity: 0.6;
    }

    .animation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .animation-title {
      flex: 1;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .name-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
    }

    .name-input:focus {
      outline: none;
      border-color: #667eea;
    }

    .animation-actions {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      width: 28px;
      height: 28px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .icon-btn:hover:not(:disabled) {
      background: #f0f0f0;
      border-color: #667eea;
    }

    .icon-btn.delete:hover {
      background: #fee;
      border-color: #ef4444;
      color: #ef4444;
    }

    .animation-settings {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .setting-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .setting-item label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
    }

    .input-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .number-input {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .unit {
      font-size: 12px;
      color: #999;
      min-width: 24px;
    }

    .select-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      background: white;
    }

    .setting-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .setting-group > label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .timing-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .timing-btn {
      padding: 6px 12px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .timing-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .timing-btn.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    .timeline-section {
      margin-top: 8px;
      padding: 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
    }

    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .timeline-header label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .add-keyframe-btn {
      padding: 6px 12px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .add-keyframe-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .timeline-bar {
      margin-bottom: 16px;
    }

    .timeline-track {
      position: relative;
      height: 60px;
      background: linear-gradient(to right, #f0f0f0 0%, #e0e0e0 100%);
      border-radius: 4px;
      margin-bottom: 8px;
      border: 1px solid #d0d0d0;
    }

    .keyframe-marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      cursor: pointer;
      transition: all 0.2s;
    }

    .keyframe-marker:hover {
      transform: translate(-50%, -50%) scale(1.2);
    }

    .keyframe-marker.selected .keyframe-dot {
      background: #667eea;
      border-color: #667eea;
      transform: scale(1.3);
    }

    .keyframe-dot {
      width: 16px;
      height: 16px;
      background: white;
      border: 2px solid #999;
      border-radius: 50%;
      transition: all 0.2s;
    }

    .keyframe-label {
      position: absolute;
      top: -24px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-weight: 600;
      color: #666;
      white-space: nowrap;
    }

    .timeline-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #999;
      padding: 0 4px;
    }

    .keyframe-editor {
      padding: 12px;
      background: #f9f9f9;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
    }

    .keyframe-editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .keyframe-title {
      font-size: 12px;
      font-weight: 600;
      color: #667eea;
    }

    .slider-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .slider-control input[type="range"] {
      flex: 1;
      height: 24px;
      -webkit-appearance: none;
      appearance: none;
      background: #e0e0e0;
      border-radius: 12px;
      outline: none;
    }

    .slider-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
    }

    .slider-control input[type="range"]::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      border: none;
    }

    .json-textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 12px;
      font-family: 'Monaco', 'Courier New', monospace;
      resize: vertical;
    }

    .json-textarea:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .presets-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
    }

    .section-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
    }

    .presets-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
    }

    .preset-btn {
      padding: 12px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .preset-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
      transform: translateY(-2px);
    }

    .preset-icon {
      font-size: 24px;
    }

    .preset-name {
      font-size: 10px;
      font-weight: 500;
      color: #666;
      text-align: center;
    }

    .code-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
    }

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .code-header span {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .copy-btn {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      opacity: 0.6;
      transition: opacity 0.2s;
    }

    .copy-btn:hover {
      opacity: 1;
    }

    .code-output {
      width: 100%;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      background: #f9f9f9;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 300px;
      overflow-y: auto;
    }
  `]
})
export class AnimationTimelineComponent implements OnInit {
  @Input() animations: AnimationConfig[] = [];
  @Output() animationsChange = new EventEmitter<AnimationConfig[]>();

  tokens = DESIGN_TOKENS;
  selectedAnimation: AnimationConfig | null = null;
  selectedKeyframe: Keyframe | null = null;
  keyframePropertiesJson: Record<string, string> = {};

  timingFunctions = [
    { name: 'Ease', value: 'ease' },
    { name: 'Linear', value: 'linear' },
    { name: 'Ease-In', value: 'ease-in' },
    { name: 'Ease-Out', value: 'ease-out' },
    { name: 'Ease-In-Out', value: 'ease-in-out' }
  ];

  presets = [
    {
      name: 'Fade In',
      icon: '👻',
      description: 'Fade from transparent to opaque',
      animation: {
        name: 'fadeIn',
        duration: 1000,
        keyframes: [
          { time: 0, properties: { opacity: 0 } },
          { time: 100, properties: { opacity: 1 } }
        ]
      }
    },
    {
      name: 'Slide In',
      icon: '➡️',
      description: 'Slide in from left',
      animation: {
        name: 'slideIn',
        duration: 800,
        keyframes: [
          { time: 0, properties: { transform: 'translateX(-100%)' } },
          { time: 100, properties: { transform: 'translateX(0)' } }
        ]
      }
    },
    {
      name: 'Scale Up',
      icon: '🔍',
      description: 'Scale from small to normal',
      animation: {
        name: 'scaleUp',
        duration: 600,
        keyframes: [
          { time: 0, properties: { transform: 'scale(0)' } },
          { time: 100, properties: { transform: 'scale(1)' } }
        ]
      }
    },
    {
      name: 'Rotate',
      icon: '🔄',
      description: 'Rotate 360 degrees',
      animation: {
        name: 'rotate',
        duration: 1000,
        iterations: 'infinite',
        keyframes: [
          { time: 0, properties: { transform: 'rotate(0deg)' } },
          { time: 100, properties: { transform: 'rotate(360deg)' } }
        ]
      }
    },
    {
      name: 'Bounce',
      icon: '⬆️',
      description: 'Bounce up and down',
      animation: {
        name: 'bounce',
        duration: 1000,
        timingFunction: 'ease-out',
        keyframes: [
          { time: 0, properties: { transform: 'translateY(0)' } },
          { time: 50, properties: { transform: 'translateY(-30px)' } },
          { time: 100, properties: { transform: 'translateY(0)' } }
        ]
      }
    }
  ];

  ngOnInit(): void {
    // Initialize keyframe properties JSON
    this.animations.forEach(animation => {
      animation.keyframes.forEach(keyframe => {
        this.keyframePropertiesJson[keyframe.id] = JSON.stringify(keyframe.properties, null, 2);
      });
    });
  }

  /**
   * Add new animation
   */
  addAnimation(): void {
    const newAnimation: AnimationConfig = {
      id: this.generateId(),
      name: `Animation ${this.animations.length + 1}`,
      duration: 1000,
      delay: 0,
      iterations: 1,
      direction: 'normal',
      timingFunction: 'ease',
      fillMode: 'both',
      keyframes: [
        { id: this.generateId(), time: 0, properties: {} },
        { id: this.generateId(), time: 100, properties: {} }
      ],
      enabled: true
    };

    // Initialize keyframe properties JSON
    newAnimation.keyframes.forEach(keyframe => {
      this.keyframePropertiesJson[keyframe.id] = JSON.stringify(keyframe.properties, null, 2);
    });

    this.animations.push(newAnimation);
    this.emitChange();
  }

  /**
   * Delete animation
   */
  deleteAnimation(index: number): void {
    if (confirm('Delete this animation?')) {
      this.animations.splice(index, 1);
      this.emitChange();
    }
  }

  /**
   * Duplicate animation
   */
  duplicateAnimation(animation: AnimationConfig): void {
    const duplicate: AnimationConfig = {
      ...animation,
      id: this.generateId(),
      name: `${animation.name} (copy)`,
      keyframes: animation.keyframes.map(keyframe => ({
        ...keyframe,
        id: this.generateId()
      }))
    };

    // Initialize keyframe properties JSON
    duplicate.keyframes.forEach(keyframe => {
      this.keyframePropertiesJson[keyframe.id] = JSON.stringify(keyframe.properties, null, 2);
    });

    this.animations.push(duplicate);
    this.emitChange();
  }

  /**
   * Add keyframe to animation
   */
  addKeyframe(animation: AnimationConfig): void {
    const newKeyframe: Keyframe = {
      id: this.generateId(),
      time: 50,
      properties: {}
    };
    animation.keyframes.push(newKeyframe);
    animation.keyframes.sort((a, b) => a.time - b.time);
    this.keyframePropertiesJson[newKeyframe.id] = JSON.stringify({}, null, 2);
    this.emitChange();
  }

  /**
   * Delete keyframe
   */
  deleteKeyframe(animation: AnimationConfig): void {
    if (!this.selectedKeyframe) return;
    if (animation.keyframes.length <= 2) {
      alert('Animation must have at least 2 keyframes (0% and 100%)');
      return;
    }

    const index = animation.keyframes.findIndex(k => k.id === this.selectedKeyframe!.id);
    if (index !== -1) {
      animation.keyframes.splice(index, 1);
      this.selectedKeyframe = null;
      this.emitChange();
    }
  }

  /**
   * Select keyframe
   */
  selectKeyframe(animation: AnimationConfig, keyframe: Keyframe): void {
    this.selectedAnimation = animation;
    this.selectedKeyframe = keyframe;
  }

  /**
   * Update keyframe properties from JSON
   */
  updateKeyframeProperties(keyframe: Keyframe): void {
    try {
      keyframe.properties = JSON.parse(this.keyframePropertiesJson[keyframe.id]);
      this.emitChange();
    } catch (e) {
      // Invalid JSON, don't update
    }
  }

  /**
   * Play animation (visual preview)
   */
  playAnimation(animation: AnimationConfig): void {
    console.log('Playing animation:', animation.name);
    // This would trigger an actual animation preview in a real implementation
  }

  /**
   * Apply preset
   */
  applyPreset(preset: any): void {
    const newAnimation: AnimationConfig = {
      id: this.generateId(),
      name: preset.animation.name,
      duration: preset.animation.duration,
      delay: 0,
      iterations: preset.animation.iterations || 1,
      direction: 'normal',
      timingFunction: preset.animation.timingFunction || 'ease',
      fillMode: 'both',
      keyframes: preset.animation.keyframes.map((kf: any) => ({
        id: this.generateId(),
        time: kf.time,
        properties: kf.properties
      })),
      enabled: true
    };

    // Initialize keyframe properties JSON
    newAnimation.keyframes.forEach(keyframe => {
      this.keyframePropertiesJson[keyframe.id] = JSON.stringify(keyframe.properties, null, 2);
    });

    this.animations.push(newAnimation);
    this.emitChange();
  }

  /**
   * Generate CSS @keyframes code
   */
  generateCSS(): string {
    if (this.animations.length === 0) {
      return '/* No animations configured */';
    }

    return this.animations
      .filter(a => a.enabled)
      .map(animation => {
        const keyframesCSS = animation.keyframes
          .sort((a, b) => a.time - b.time)
          .map(keyframe => {
            const props = Object.entries(keyframe.properties)
              .map(([key, value]) => `  ${key}: ${value};`)
              .join('\n');
            return `  ${keyframe.time}% {\n${props}\n  }`;
          })
          .join('\n');

        const animationRule = `animation: ${animation.name} ${animation.duration}ms ${animation.timingFunction} ${animation.delay}ms ${animation.iterations} ${animation.direction} ${animation.fillMode};`;

        return `@keyframes ${animation.name} {\n${keyframesCSS}\n}\n\n.${animation.name} {\n  ${animationRule}\n}`;
      })
      .join('\n\n');
  }

  /**
   * Copy CSS to clipboard
   */
  copyCSSToClipboard(): void {
    navigator.clipboard.writeText(this.generateCSS()).then(() => {
      console.log('CSS copied to clipboard');
    });
  }

  /**
   * Emit change event
   */
  emitChange(): void {
    this.animationsChange.emit([...this.animations]);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track by animation ID
   */
  trackByAnimationId(index: number, animation: AnimationConfig): string {
    return animation.id;
  }

  /**
   * Track by keyframe ID
   */
  trackByKeyframeId(index: number, keyframe: Keyframe): string {
    return keyframe.id;
  }
}
