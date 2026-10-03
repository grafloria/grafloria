import { Component, ElementRef, OnDestroy, ViewEncapsulation, viewChild } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/angular';
import type { RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { markReady } from '../demo-ready';
import { ChatbotFlowController } from './chatbot-flow-controller';

/**
 * A ManyChat-style chatbot builder on the Grafloria engine.
 *
 *   • Every STEP is an HTML card. Every button on a message has its OWN output
 *     port, pinned to that button's row: the page measures the card in a hidden
 *     twin and places each port at the row's centre, so a line always leaves
 *     the button it belongs to — and moves with it when the card grows.
 *   • A step that waits for a reply grows two more outputs: "Action on reply"
 *     (orange) and "If contact has not responded" (red), plus "Next Step".
 *   • Select a card and edit it on the left: the text, the buttons, the blocks.
 *     The card re-measures and its ports follow on every keystroke.
 *   • Drag a line from any dot and drop it anywhere on a card — the engine's
 *     smart auto-connect lands it on the card's input. Drop it on empty canvas
 *     and the page offers to create the next step right there.
 *   • Preview runs the bot for real: it walks the same links you drew.
 *
 * <grafloria-diagram> mounts the same render() instance the JS page drives.
 * The flow's data and its cards live in chatbot-flow-data.ts; the engine side
 * (repaint, ports, connect, the Preview's walk) in ChatbotFlowController. This
 * component owns the markup — the step editor, the chrome over the canvas, the
 * Preview chat — and zone.js re-renders it after every event and timer.
 */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './chatbot-flow.component.html',
  styleUrl: './chatbot-flow.component.css',
})
export class ChatbotFlowComponent implements OnDestroy {
  readonly c = new ChatbotFlowController();
  readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  // The flow goes in from the controller once this component (and its
  // stylesheet) is on the page — the cards are measured in it — so the canvas
  // mounts empty.
  readonly spec = { nodes: [], edges: [] };
  readonly options: RenderOptions = { interaction: { portVisibility: 'always' as never } };
  readonly fields = ['Phone', 'Email', 'Text'];

  onReady(instance: DiagramInstance): void {
    // (ready) fires inside the diagram's ngAfterViewInit, mid change detection:
    // fill it a microtask later, and zone.js renders the editor after that.
    void Promise.resolve().then(() => {
      this.c.init(instance, this.stage().nativeElement);
      markReady();
    });
  }

  ngOnDestroy(): void { this.c.destroy(); }

  val(e: Event): string { return (e.target as HTMLInputElement).value; }
  rect(e: Event): DOMRect { return (e.currentTarget as HTMLElement).getBoundingClientRect(); }
  blockName(k: string): string { return k === 'text' ? 'Text' : k === 'collect' ? 'Data collection' : k === 'delay' ? 'Delay' : 'Image'; }
}
