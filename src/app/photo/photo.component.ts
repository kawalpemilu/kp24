import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialog,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxTippyModule, NgxTippyInstance } from 'ngx-tippy-wrapper';
import { MatIconModule } from '@angular/material/icon';
import { PhotoDialog } from './photo-dialog.component';

interface TippyInstanceWithLoading extends NgxTippyInstance {
  _isFetching: boolean;
  _failedToLoad: boolean;
}

@Component({
  selector: 'app-photo',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    NgxTippyModule,
    MatIconModule,
  ],
  templateUrl: './photo.component.html',
  styleUrl: './photo.component.css',
})
export class PhotoComponent {
  @Input() maxWidth = 125;
  @Input() maxHeight = 125;
  @Input() hiResThumb = false;
  @Input() showRoiTooltip = true;
  @Output() roiImageUrl = new EventEmitter<string>();
  @Output() roiImageUrl2 = new EventEmitter<string>();

  largePhoto = '';
  thumbnail = '';
  tooltipUrl?: string = undefined;

  @Input({ required: false })
  set roiToolTip(value: string[]) {
    this.tooltipUrl = this.roiUrl(value[0], value[1], 'paslon');
    this.roiImageUrl.emit(this.tooltipUrl);
    this.roiImageUrl2.emit(this.roiUrl(value[0], value[1], 'lokasi'));
  }

  roiUrl(
    photoUrl: string | undefined,
    tpsId: string,
    type: 'paslon' | 'lokasi'
  ) {
    if (photoUrl == undefined || photoUrl.includes('data:image')) {
      return '';
    }

    return !photoUrl
      ? ''
      : `https://storage.googleapis.com/kawalc1/static/2024/transformed/${tpsId.substring(
          0,
          10
        )}/${tpsId.substring(10)}/extracted/${photoUrl.replace(
          'http://lh3.googleusercontent.com/',
          ''
        )}%3Ds1280~${type}.webp`;
  }

  loadTooltipImage(ngxTippyInstance: NgxTippyInstance) {
    const instance = ngxTippyInstance as TippyInstanceWithLoading;
    instance._isFetching = true;
    instance._failedToLoad = true;

    const tooltipPicture = instance.reference.getAttribute('id');
    if (!tooltipPicture || tooltipPicture == 'undefined') {
      instance.disable();
      return;
    }
    fetch(tooltipPicture)
      .then((response) => {
        if (response.ok && response.status == 200) {
          return response.blob();
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
    const instance = ngxTippyInstance as TippyInstanceWithLoading;
    if (instance._isFetching || instance._failedToLoad) {
      return;
    }
  }

  @Input({ required: true })
  set photoUrl(value: string) {
    let url = value;
    if (value.startsWith('http://')) {
      url = value.replace('http://', 'https://');
    }
    if (url.endsWith('.png') || url.startsWith('data:')) {
      this.largePhoto = this.thumbnail = url;
    } else {
      this.largePhoto = url + '=s1280';
      this.thumbnail = url + '=s200';
    }
  }

  constructor(public dialog: MatDialog) {}

  openDialog() {
    this.dialog.open(PhotoDialog, {
      height: '95vh',
      width: '95vh',
      data: {
        largePhoto: this.largePhoto,
      },
    });

    return false;
  }
}
