import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxTippyModule, NgxTippyInstance } from 'ngx-tippy-wrapper';

@Component({
    selector: 'app-photo',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, NgxTippyModule],
    template: `
        <div #tippyTemplateRef>
          <img alt="ROI paslon" style="min-height:120px;width:150px" loading="lazy"/>
        </div>
        <div [style.width]="maxWidth + 'px'" [style.height]="maxHeight + 'px'" [ngxTippy]="tippyTemplateRef"
        [title]="tooltipUrl" [tippyProps]="{
          placement: 'right',
          delay: [200, 200],
          animation: 'shift-toward',
          onCreate: loadTooltipImage
        }">
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
    @Input() maxWidth = 125;
    @Input() maxHeight = 125;
    @Input() hiResThumb = false;

    largePhoto = '';
    thumbnail = '';
    tooltipUrl?: string;

    @Input({ required: false })
    set roiToolTip(value: string) {
      this.tooltipUrl = value
    }

    loadTooltipImage(instance: NgxTippyInstance) {
      const tooltipPicture = instance.reference.getAttribute('title')
      if (!tooltipPicture)
        return
      fetch(tooltipPicture)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
          }
          return response.blob()
        })
        .then((blob) => {
          const src = URL.createObjectURL(blob);
          const image = new Image();
          image.style.display = 'block';
          image.style.width = '150px';
          image.src = src;
          instance.setContent(image);
          instance.props['maxWidth'] = '170px';
        })
        .catch(() => {
          instance.setContent('');
          instance.disable();
        })
        .finally(() => {
        });
    }

    @Input({ required: true })
    set photoUrl(value: string) {
        let url = value;
        if (value.startsWith("http://")) {
            url = value.replace("http://", "https://");
        }
        if (url.endsWith('.png') || url.startsWith('data:')) {
            this.largePhoto = this.thumbnail = url;
        } else {
            this.largePhoto = url + '=s1280';
            this.thumbnail = url + '=s200';
        }
    }
}
