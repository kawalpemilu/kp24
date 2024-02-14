import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxTippyModule, NgxTippyInstance } from 'ngx-tippy-wrapper';

interface TippyInstanceWithLoading extends NgxTippyInstance {
  _isFetching: boolean
  _failedToLoad: boolean
}

@Component({
    selector: 'app-photo',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, NgxTippyModule],
    template: `
      @if (showRoiTooltip) {
        <div #tippyTemplateRef>
          <img alt="ROI paslon" style="min-height:120px;width:150px" loading="lazy"/>
        </div>
        <div [style.width]="maxWidth + 'px'"
             [style.height]="maxHeight + 'px'"
             [ngxTippy]="tippyTemplateRef"
             [title]="tooltipUrl"
             [tippyProps]="{
                placement: 'right',
                delay: [200, 200],
                animation: 'shift-toward',
                onCreate: loadTooltipImage,
                onShow: onShowTippy,
             }">
            <a [href]="largePhoto" target="_blank">
                <img [style.max-width]="maxWidth + 'px'"
                     [style.max-height]="maxHeight + 'px'"
                     [src]="hiResThumb ? largePhoto : thumbnail" /><br>
            </a>
        </div>
      } @else {
        <a [href]="largePhoto" target="_blank">
            <img [style.max-width]="maxWidth + 'px'"
                 [style.max-height]="maxHeight + 'px'"
                 [src]="hiResThumb ? largePhoto : thumbnail" /><br>
        </a>
      }
        <!-- @if (imageMetadata; as m) { -->
            <!-- Size: {{ (m.z || m.s) / 1024 | number: '1.0-0'}}KB<br> -->
            <!-- <pre style="text-align: left; width: 200px">{{ m | json }}</pre> -->
        <!-- } -->`,
})
export class PhotoComponent {
    @Input() maxWidth = 125;
    @Input() maxHeight = 125;
    @Input() hiResThumb = false;
    @Input() showRoiTooltip = true;
    @Output() roiImageUrl = new EventEmitter<string>();

    largePhoto = '';
    thumbnail = '';
    tooltipUrl?: string = undefined;

    @Input({ required: false })
    set roiToolTip(value: string[]) {
      this.tooltipUrl = this.roiUrl(value[0], value[1]);
      this.roiImageUrl.emit(this.tooltipUrl);
    }

    roiUrl(photoUrl: string | undefined, tpsId: string) {
      if (photoUrl == undefined || photoUrl.includes('data:image')) {
        return ''
      }

      return !photoUrl ? '' :
        `https://storage.googleapis.com/kawalc1/static/2024/transformed/${
          tpsId.substring(0,10)}/${
          tpsId.substring(10)}/extracted/${
          photoUrl.replace('http://lh3.googleusercontent.com/', '')
        }%3Ds1280~paslon.webp`
    }

    loadTooltipImage(ngxTippyInstance: NgxTippyInstance) {
      const instance = ngxTippyInstance as TippyInstanceWithLoading
      instance._isFetching = true;
      instance._failedToLoad = true;

      const tooltipPicture = instance.reference.getAttribute('title')
      if (!tooltipPicture || tooltipPicture == 'undefined') {
        instance.disable()
        return
      }
      fetch(tooltipPicture)
        .then((response) => {
          if (response.ok && response.status == 200) {
            return response.blob()
          }
          instance._isFetching = true;
          throw new Error(`${response.status} ${response.statusText}`);
        })
        .then((blob) => {
          const src = URL.createObjectURL(blob);
          const image = new Image();
          image.style.display = 'block';
          image.style.width = '150px';
          image.src = src;
          instance.setContent(image);
          instance.props['maxWidth'] = '170px';
          instance._failedToLoad = false;
        })
        .catch(() => {
          instance.disable();
          instance.setContent('');
          instance._failedToLoad = true;
        })
        .finally(() => {
          instance._isFetching = false;
        });
    }

    onShowTippy(ngxTippyInstance: NgxTippyInstance) {
      const instance = ngxTippyInstance as TippyInstanceWithLoading
      if (instance._isFetching || instance._failedToLoad) {
        return;
      }
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
