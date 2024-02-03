import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { ref, uploadString, UploadResult } from "firebase/storage";
import { Storage } from "@angular/fire/storage";
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { APPROVAL_STATUS, autoId, ImageMetadata, Votes, PendingAggregateVotes, UserProfile } from '../../../functions/src/interfaces';
import { DigitizeComponent } from './digitize.component';
import { AppService } from '../app.service';
import * as piexif from 'piexifjs';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule,  DigitizeComponent,
    MatIconModule, MatButtonModule, MatExpansionModule, MatProgressSpinnerModule],
  templateUrl: './upload.component.html',
  styles: `li { margin-left: -10px; padding-right: 10px; line-height: 2; }`
})
export class UploadComponent {
  @Input({required: true}) userProfile!: UserProfile | null;
  @Input({required: true}) id!: string;
  @Input({required: true}) votes!: Votes;
  @Output() onUpload = new EventEmitter<PendingAggregateVotes>();

  private storage: Storage = inject(Storage);

  digitizing = false;
  imageId = '';
  metadata?: ImageMetadata;
  imgURL = '';
  uploadResult$?: Promise<UploadResult | null>;

  constructor(public service: AppService) { }

  async handleUpload(event: any) {
    if (event.target.files.length === 0) {
      console.log('No file to be uploaded');
      return;
    }

    let file: File = event.target.files[0];
    if (!file.type.match(/image\/*/)) {
      console.log('Invalid mime: ', file.type);
      return;
    }

    if (!this.service.auth.currentUser?.uid) {
      alert('Please sign in first');
      return;
    }

    this.imgURL = await this.readAsDataUrl(file);
    if (!this.imgURL) {
      alert('Invalid image');
      return;
    }

    this.metadata = { s: this.imgURL.length, l: file.lastModified };
    const exifObj = this.populateMetadata(this.imgURL, this.metadata);
    if (file.size > 800 * 1024) {
      this.imgURL = await this.compress(this.imgURL as string, 2048);
      if (!this.imgURL) {
        alert('Cannot compress image');
        return;
      }
      if (exifObj) {
        try {
          // https://piexifjs.readthedocs.io/en/2.0/sample.html#insert-exif-into-jpeg
          this.imgURL = piexif.insert(piexif.dump(exifObj), this.imgURL);
        } catch (e) {
          console.error(e);
        }
      }
      this.metadata.z = this.imgURL.length;
    }
    if (this.metadata.o !== undefined && this.metadata.o !== 1) {
      this.imgURL = await this.rotateImageUrl(this.imgURL, this.metadata.o);
    }

    this.digitizing = true;
    this.imageId = autoId();
    this.uploadResult$ = this.startUploadPhoto();
  }

  async startUploadPhoto() {
    const uid = this.service.auth.currentUser?.uid;
    const filename = `/uploads/${this.id}/${uid}/${this.imageId}`;
    console.log('Uploading to', filename);
    try {
      const uploadRef = ref(this.storage, filename);
      const result = await uploadString(uploadRef, this.imgURL, 'data_url');
      console.log('Uploaded a blob or file!', result);
      return result;
    } catch (e) {
      alert('Unable to upload photo');
      console.error('Unable to upload file', e);
      return null;
    }
  }

  onDigitized(votes: Votes) {
    if (!this.metadata || !this.uploadResult$) {
      console.error('The image was not parsed yet');
      return;
    }

    if (votes.status === APPROVAL_STATUS.APPROVED) {
      // Capture all the data before it's cleared below.
      const idLokasi = this.id;
      const imageId = this.imageId;
      const imageMetadata = this.metadata;
      const photoUrl = this.imgURL;
      const onSubmitted = this.uploadResult$.then(res => {
        if (!res) return '';
        return this.service
          .upload({
            idLokasi,
            imageId,
            imageMetadata,
            servingUrl: '', // Will be populated by the server.
            votes: [votes],
            status: APPROVAL_STATUS.NEW,
          })
          .then(v => v.data ? imageId : '')
      }).catch(e => {
        alert('Unable to submit votes');
        console.error('Unable submit votes', e);
        return '';
      });
      this.onUpload.emit({
        idLokasi,
        name: '',
        totalTps: 0,
        totalPendingTps: 0,
        totalErrorTps: 0,
        totalCompletedTps: 0,
        pas1: votes.pas1,
        pas2: votes.pas2,
        pas3: votes.pas3,
        updateTs: 0,
        status: APPROVAL_STATUS.NEW,
        uploadedPhoto: { imageId, photoUrl },
        onSubmitted
      });
    }

    // Clear the states.
    this.digitizing = false;
    this.imageId = '';
    this.metadata = undefined;
    this.imgURL = '';
    this.uploadResult$ = undefined;
  }

  private async compress(dataUrl: string, maxDimension: number): Promise<string> {
    const img = await this.getImage(dataUrl);
    let width = img.width;
    let height = img.height;
    const scale = Math.min(1, maxDimension / width, maxDimension / height);
    if (scale < 1) {
      width *= scale;
      height *= scale;
    }
    const elem = document.createElement('canvas'); // Use Angular's Renderer2 method
    elem.width = width;
    elem.height = height;
    const ctx = elem.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.canvas.toDataURL('image/jpeg');
  }

  private getImage(dataUrl: string): Promise<HTMLImageElement> {
    const img = new Image();
    return new Promise(resolve => {
      img.src = dataUrl;
      img.onload = () => resolve(img);
    });
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  }

  private populateMetadata(imgURL: string, m: ImageMetadata) {
    try {
      const exifObj = piexif.load(imgURL as string);
      const z = exifObj['0th'];
      if (z) {
        if (z[piexif.TagValues.ImageIFD.Make]) {
          m.m = `${z[piexif.TagValues.ImageIFD.Make]}`;
        }
        if (z[piexif.TagValues.ImageIFD.Model]) {
          m.m = `${m.m ? (m.m + ', ') : ''}${z[piexif.TagValues.ImageIFD.Model]}`;
        }
        const o = z[piexif.TagValues.ImageIFD.Orientation] as number;
        if (o) m.o = o;
      }
      const g = exifObj['GPS'];
      if (g) {
        const y = this.convertDms(
          g[piexif.TagValues.GPSIFD.GPSLatitude],
          g[piexif.TagValues.GPSIFD.GPSLatitudeRef]
        );
        if (y) m.y = y;
        const x = this.convertDms(
          g[piexif.TagValues.GPSIFD.GPSLongitude],
          g[piexif.TagValues.GPSIFD.GPSLongitudeRef]
        );
        if (x) m.x = x;
      }
      return exifObj;
    } catch (e) {
      return null;
    }
  }

  private convertDms(dms: any, direction: any) {
    if (!dms || !direction || dms.length < 3) {
      return null;
    }
    const degs = dms[0][0] / dms[0][1];
    const mins = dms[1][0] / dms[1][1];
    const secs = dms[2][0] / dms[2][1];
    return this.convertDMSToDD(degs, mins, secs, direction);
  }

  private convertDMSToDD(degrees: any, minutes: any, seconds: any, direction: any) {
    let dd = degrees + minutes / 60.0 + seconds / (60.0 * 60);
    if (direction === 'S' || direction === 'W') {
      dd = dd * -1;
    } // Don't do anything for N or E
    return dd;
  }

  /**
   * https://piexifjs.readthedocs.io/en/2.0/sample.html#insert-exif-into-jpeg
   */
  private async rotateImageUrl(dataUrl: string, orientation: number) {
    const image = await this.getImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Fail to create ctx');
      return dataUrl;
    }
    let x = 0;
    let y = 0;
    ctx.save();
    switch (orientation) {
      case 2:
        x = -canvas.width;
        ctx.scale(-1, 1);
        break;

      case 3:
        x = -canvas.width;
        y = -canvas.height;
        ctx.scale(-1, -1);
        break;

      case 4:
        y = -canvas.height;
        ctx.scale(1, -1);
        break;

      case 5:
        canvas.width = image.height;
        canvas.height = image.width;
        ctx.translate(canvas.width, canvas.height / canvas.width);
        ctx.rotate(Math.PI / 2);
        y = -canvas.width;
        ctx.scale(1, -1);
        break;

      case 6:
        canvas.width = image.height;
        canvas.height = image.width;
        ctx.translate(canvas.width, canvas.height / canvas.width);
        ctx.rotate(Math.PI / 2);
        break;

      case 7:
        canvas.width = image.height;
        canvas.height = image.width;
        ctx.translate(canvas.width, canvas.height / canvas.width);
        ctx.rotate(Math.PI / 2);
        x = -canvas.height;
        ctx.scale(-1, 1);
        break;

      case 8:
        canvas.width = image.height;
        canvas.height = image.width;
        ctx.translate(canvas.width, canvas.height / canvas.width);
        ctx.rotate(Math.PI / 2);
        x = -canvas.height;
        y = -canvas.width;
        ctx.scale(-1, -1);
        break;
    }
    ctx.drawImage(image, x, y);
    ctx.restore();
    return canvas.toDataURL('image/jpeg');
  }

  userExceedsMaxUploads() {
    const u = this.userProfile;
    return u && (u.uploadCount >= u.uploadMaxCount);
  }
}
