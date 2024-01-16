import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { Auth, getRedirectResult, signInWithPopup, signOut, user } from '@angular/fire/auth';
import { mergeAll, Observable, of, switchMap } from 'rxjs';
import { GoogleAuthProvider } from "firebase/auth";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { Storage } from "@angular/fire/storage";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { AggregateVotes, TpsData, UploadRequest } from '../../../functions/src/interfaces';

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
  imports: [CommonModule, RouterOutlet, RouterLink, FormsModule,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.css'
})
export class UploadComponent implements OnInit {
  private functions: Functions = inject(Functions);
  private storage: Storage = inject(Storage);

  auth: Auth = inject(Auth);
  user$ = user(this.auth);

  provider = new GoogleAuthProvider();
  loading = true;
  uploading = false;

  id$!: Observable<string>;
  id = '';

  tpsVotes: AggregateVotes[] = [];

  constructor(private route: ActivatedRoute) { }

  async ngOnInit() {
    this.id$ = this.route.paramMap.pipe(
      switchMap(async params => {
        this.id = params.get('id') || '';
        if (!(/^\d{11,13}$/.test(this.id))) {
          alert('Invalid id: ' + this.id);
          return of();
        }

        try {
          const callable = httpsCallable(this.functions, 'hierarchy');
          const tpsData = (await callable({ id: this.id })).data as TpsData;
          this.tpsVotes = Object.values(tpsData.votes);
          this.tpsVotes.sort((a, b) => b.uploadTimeMs - a.uploadTimeMs);
        } catch (e) {
          console.error('Error getting hierarchy', e);
          return of();
        }
        return of(this.id);
      }), mergeAll()
    );
    try {
      const result = await getRedirectResult(this.auth);
      console.log('RedirectResult', result);
      this.loading = false;
    } catch (e) {
      console.error(e);
    }
  }

  async handleUpload(event: any) {
    if (event.target.files.length === 0) {
      console.log('No file to be uploaded');
      return;
    }

    const file: File = event.target.files[0];
    if (!file.type.match(/image\/*/)) {
      console.log('Invalid mime: ', file.type);
      return;
    }

    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      alert('Please sign in first');
      return;
    }

    const imageId = autoId();
    const filename = `/uploads/${this.id}/${uid}/${imageId}`;
    console.log('Uploading to', filename);

    const mountainsRef = ref(this.storage, filename);

    this.uploading = true;
    await uploadBytes(mountainsRef, file).then((snapshot) => {
      console.log('Uploaded a blob or file!');
    });
    this.uploading = false;
    this.loading = true;

    await this.upload(imageId);
  }

  async upload(imageId = 'preserve') {
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
      };
      const callable = httpsCallable(this.functions, 'upload');
      const result = (await callable(request));
      console.log('Uploaded', request, result);
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
}
