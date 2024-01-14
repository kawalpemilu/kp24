import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { Auth, getRedirectResult, signOut, User, user } from '@angular/fire/auth';
import { mergeAll, Observable, of, Subscription, switchMap } from 'rxjs';
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { Functions, httpsCallable, connectFunctionsEmulator } from '@angular/fire/functions';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

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
  imports: [CommonModule, RouterOutlet, RouterLink, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.css'
})
export class UploadComponent implements OnInit, OnDestroy {
  private functions: Functions = inject(Functions);

  auth: Auth = inject(Auth);
  user$ = user(this.auth);
  userSubscription: Subscription;

  provider = new GoogleAuthProvider();
  imageUrl = '';
  loading = true;
  uploading = false;

  id$!: Observable<string>;
  id = '';

  constructor(private route: ActivatedRoute) {
    this.userSubscription = this.user$.subscribe((aUser: User | null) => {
      if (aUser) {
        console.log('Logged in user', aUser);
        this.loadImage();
      } else {
        console.log('The user is not logged in');
      }
    });
  }

  async ngOnInit() {
    this.id$ = this.route.paramMap.pipe(
      switchMap(async params => {
        this.id = params.get('id') || '';
        if (!(/^\d{11,13}$/.test(this.id))) {
          alert('Invalid id: ' + this.id);
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

  ngOnDestroy() {
    this.userSubscription.unsubscribe();
  }

  async upload(event: any) {
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

    const storage = getStorage();
    const mountainsRef = ref(storage, filename);

    this.uploading = true;
    await uploadBytes(mountainsRef, file).then((snapshot) => {
      console.log('Uploaded a blob or file!');
    });
    this.uploading = false;
    this.loading = true;

    await this.loadImage(imageId);
  }

  async loadImage(imageId?: string) {
    try {
      // connectFunctionsEmulator(this.functions, "127.0.0.1", 5001);
      const callable = httpsCallable(this.functions, 'photos');
      this.imageUrl = (await callable({ tpsId: this.id, imageId })).data as string;
      console.log(this.imageUrl);
    } catch (e) {
      console.error(e);
    }
    this.loading = false;
  }

  login() {
    console.log('Try logging in');
    signInWithRedirect(this.auth, this.provider);
  }

  async logout() {
    signOut(this.auth).then(() => {
      console.log('Sign-out successful');
    }).catch((error) => {
      console.error('Signout failed', error);
    });
  }
}
