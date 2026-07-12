import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'lib-canvas-ng-canvas-ng',
    imports: [CommonModule],
    templateUrl: './canvas-ng-canvas-ng.component.html',
    styleUrl: './canvas-ng-canvas-ng.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasNgCanvasNgComponent {}
