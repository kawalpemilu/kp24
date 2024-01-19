import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth, signInWithPopup, user } from '@angular/fire/auth';
import { GoogleAuthProvider } from "firebase/auth";
import { ref, uploadString } from "firebase/storage";
import { Storage } from "@angular/fire/storage";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { ImageMetadata, UploadRequest } from '../../../functions/src/interfaces';
import * as piexif from 'piexifjs';

/** Returns a random n-character identifier containing [a-zA-Z0-9]. */
export function autoId(n = 20): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let autoId = '';
  for (let i = 0; i < n; i++) {
    autoId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return autoId;
}

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.css'
})
export class UploadComponent implements OnInit {
  @Input() id = '';
  @Output() onUpload = new EventEmitter<string>();

  private functions: Functions = inject(Functions);
  private storage: Storage = inject(Storage);

  auth: Auth = inject(Auth);
  user$ = user(this.auth);

  provider = new GoogleAuthProvider();
  loading = false;
  uploading = false;

  async ngOnInit() {
  }

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

    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      alert('Please sign in first');
      return;
    }

    let imgURL = await this.readAsDataUrl(file);
    if (!imgURL) {
      alert('Invalid image');
      return;
    }

    const metadata: ImageMetadata = { s: imgURL.length, l: file.lastModified };
    const exifObj = this.populateMetadata(imgURL, metadata);
    if (file.size > 800 * 1024) {
      imgURL = await this.compress(imgURL as string, 2048);
      if (!imgURL) {
        alert('Cannot compress image');
        return;
      }
      if (exifObj) {
        try {
          // https://piexifjs.readthedocs.io/en/2.0/sample.html#insert-exif-into-jpeg
          imgURL = piexif.insert(piexif.dump(exifObj), imgURL);
        } catch (e) {
          console.error(e);
        }
      }
      metadata.z = imgURL.length;
    }
    if (metadata.o !== undefined && metadata.o !== 1) {
      imgURL = await this.rotateImageUrl(imgURL, metadata.o);
    }

    const imageId = autoId();
    const filename = `/uploads/${this.id}/${uid}/${imageId}`;
    console.log('Uploading to', filename, metadata);

    this.uploading = true;
    await uploadString(ref(this.storage, filename), imgURL as string, 'data_url');
    console.log('Uploaded a blob or file!');
    this.uploading = false;
    this.loading = true;

    try {
      const request: UploadRequest = {
        idLokasi: this.id,
        uid: '',
        imageId,
        pas1: Math.floor(Math.random() * 1000),
        pas2: Math.floor(Math.random() * 1000),
        pas3: Math.floor(Math.random() * 1000),
        sah: Math.floor(Math.random() * 1000),
        tidakSah: Math.floor(Math.random() * 1000),
        imageMetadata: metadata
      };
      console.log('UploadRequest', JSON.stringify(request, null, 2));
      const callable = httpsCallable(this.functions, 'upload');
      const result = (await callable(request));
      console.log('Uploaded', result);
      if (result.data) {
        this.onUpload.emit(result.data as string);
      } else {
        alert('Unable to upload photo');
      }
    } catch (e) {
      console.error(e);
    }
    this.loading = false;
  }

  async login() {
    console.log('Try logging in');
    // Sign in with redirect is problematic for Safari browser.
    const u = await signInWithPopup(this.auth, this.provider);
    console.log('Logged in user', u);
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
        m.m = `${z[piexif.TagValues.ImageIFD.Make]}, ${z[piexif.TagValues.ImageIFD.Model]}`;
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
}
