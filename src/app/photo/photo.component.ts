import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'app-photo',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule],
    template: `
        <div [style.width]="maxWidth + 'px'" [style.height]="maxHeight + 'px'">
            <a [href]="largePhoto" target="_blank">
                <img [style.max-width]="maxWidth + 'px'"
                    [style.max-height]="maxHeight + 'px'"
                    [src]="hiResThumb ? largePhoto : thumbnail" /><br>
            </a>
        </div>
        <!-- @if (imageMetadata; as m) { -->
            <!-- Size: {{ (m.z || m.s) / 1024 | number: '1.0-0'}}KB<br> -->
            <!-- <pre style="text-align: left; width: 200px">{{ m | json }}</pre> -->
        <!-- } -->`,
})
export class PhotoComponent {
    @Input() photoUrl = '';
    @Input() maxWidth = 125;
    @Input() maxHeight = 125;
    @Input() hiResThumb = false;

    get largePhoto() {
        if (!this.isServingUrl) return this.photoUrl;
        return this.photoUrl + '=s1280';
    }

    get thumbnail() {
        if (!this.isServingUrl) return this.photoUrl;
        return this.photoUrl + '=s200';
    }

    get isServingUrl() {
        return !this.photoUrl.endsWith('.png') &&
            !this.photoUrl.startsWith('data:');
    }
}
