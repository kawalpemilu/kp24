import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Auth, User, user, authState, idToken } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { Functions, httpsCallable, connectFunctionsEmulator } from '@angular/fire/functions';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  private functions: Functions = inject(Functions);

  private auth: Auth = inject(Auth);
  user$ = user(this.auth);
  userSubscription: Subscription;

  authState$ = authState(this.auth);
  authStateSubscription: Subscription;

  idToken$ = idToken(this.auth);
  idTokenSubscription: Subscription;

  provider = new GoogleAuthProvider();
  imageUrl = '';
  loading = true;
  uploading = false;

  constructor() {
    this.userSubscription = this.user$.subscribe((aUser: User | null) => {
      //handle user state changes here.
      console.log(aUser);
      if (!aUser) {
        console.log('try logging in');
        signInWithRedirect(this.auth, this.provider);
      } else {
        this.loadImage();
      }
    });
    this.authStateSubscription = this.authState$.subscribe((aUser: User | null) => {
      //handle auth state changes here.
      console.log(aUser);
    });
    this.idTokenSubscription = this.idToken$.subscribe((token: string | null) => {
      //handle idToken changes here.
      console.log(token);
    });
  }

  ngOnDestroy() {
    this.userSubscription.unsubscribe();
    this.authStateSubscription.unsubscribe();
    this.idTokenSubscription.unsubscribe();
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

    const storage = getStorage();
    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      alert('Please sign in first');
      return;
    }
    const filename = uid + '.jpg';
    console.log('upload to finlename', filename);
    const mountainsRef = ref(storage, filename);

    this.uploading = true;

    // 'file' comes from the Blob or File API
    // https://firebase.google.com/docs/storage/web/upload-files
    await uploadBytes(mountainsRef, file).then((snapshot) => {
      console.log('Uploaded a blob or file!');
    });

    this.uploading = false;
    this.loading = true;

    await this.loadImage();
  }

  async loadImage() {
    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      alert('Please sign in first');
      return;
    }
    // connectFunctionsEmulator(this.functions, "127.0.0.1", 5001);
    try {
      const callable = httpsCallable(this.functions, 'gsuc');
      const data = await callable({ uid });
      console.log(data);
      this.imageUrl = data.data as string;
      console.log(this.imageUrl);
    } catch (e) {
      console.error(e);
    }
    this.loading = false;
  }
}
