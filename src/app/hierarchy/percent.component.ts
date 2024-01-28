import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-percent',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (den) {
        @if (nom > 0 && nom === den) {
            100%
        } @else {
            {{ 100.0 * nom / den | number: '1.2-2' }}%
        }
        <br>
        <span style="font-size: xx-small">
            {{ nom | number }}/{{ den | number }}
        </span>
    } @else {
        -
    }
  `,
})
export class PercentComponent {
    @Input() nom = 0;
    @Input() den = 0;
}
