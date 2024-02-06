import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-percent',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (den) {
        <span>
        @if (nom > 0 && nom === den) {
            100%
        } @else {
            {{ 100.0 * nom / den | number: '1.2-2' }}%
        }
        </span>
        <br>
        <span class="fraction">
            {{ nom | number }}@if(showDen){/{{ den | number }}}
        </span>
    } @else {
        -
    }
  `,
  styles: `
    span.fraction {
        font-size: 0.55rem;
    }

    @media (min-width: 600px) {
        span.fraction {
            font-size: 0.7rem;
        }
    }
  `
})
export class PercentComponent {
    @Input() nom = 0;
    @Input() den = 0;
    @Input() showDen = true;
}
