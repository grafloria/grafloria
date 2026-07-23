import { AfterViewInit, Component } from '@angular/core';
import { GrafloriaDiagramComponent } from '@grafloria/renderer-angular';
import { umlDiagram } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** A UML class diagram from PURE DATA via the umlDiagram() kit — compartments,
 *  hollow-triangle inheritance, hollow-diamond aggregation, all interactive. */
@Component({
  standalone: true,
  imports: [GrafloriaDiagramComponent],
  template: `<grafloria-diagram [spec]="spec" style="display:block; height:100vh" />`,
})
export class ClassUmlComponent implements AfterViewInit {
  spec = umlDiagram({
    classes: [
      { id: 'Animal', abstract: true, position: { x: 380, y: 40 },
        attributes: ['# name: String', '# age: int'],
        methods: ['+ speak(): void', '+ move(): void'] },
      { id: 'Dog', position: { x: 150, y: 320 },
        attributes: ['+ breed: String'], methods: ['+ speak(): void', '+ fetch(): void'] },
      { id: 'Cat', position: { x: 620, y: 320 },
        attributes: ['+ indoor: bool'], methods: ['+ speak(): void', '+ purr(): void'] },
      { id: 'Owner', position: { x: 380, y: 600 },
        attributes: ['+ name: String'], methods: ['+ adopt(p): void'] },
    ],
    relationships: [
      { from: 'Dog', to: 'Animal', kind: 'inheritance' },
      { from: 'Cat', to: 'Animal', kind: 'inheritance' },
      { from: 'Owner', to: 'Dog', kind: 'aggregation', label: 'owns' },
      { from: 'Owner', to: 'Cat', kind: 'aggregation', label: 'owns' },
    ],
  });
  ngAfterViewInit() { markReady(); }
}
