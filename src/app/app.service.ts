import { ChangeDetectorRef, Injectable, inject } from '@angular/core';
import { Observable, catchError, of, shareReplay, switchMap } from 'rxjs';
import { Auth, signInWithPopup, signOut, user } from '@angular/fire/auth';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import { GoogleAuthProvider } from "firebase/auth";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { UploadRequest, UserProfile } from '../../functions/src/interfaces';

export declare interface StaticHierarchy {
  id2name: Record<string, string>;
  childrenIds: Record<string, string[]>;
}

@Injectable({
  providedIn: 'root',
})
export class AppService {
  provider = new GoogleAuthProvider();
  auth: Auth = inject(Auth);
  firestore: Firestore = inject(Firestore);
  functions: Functions = inject(Functions);

  public mobileQuery?: MediaQueryList;
  public hierarchy$?: Observable<StaticHierarchy>;
  public changeDetectorRef?: ChangeDetectorRef;

  profile$: Observable<UserProfile | null> = user(this.auth).pipe(
    switchMap(user => user ? this.listenUserProfile(user.uid) : of(null)),
    catchError(this.listenUserProfile.bind(this)),
    shareReplay(1));

  listenUserProfile(uid: string) {
    return new Observable<UserProfile | null>(o => {
      console.log('Listening to /u/', uid);
      const uRef = doc(this.firestore, `/u/${uid}`);
      return onSnapshot(uRef, {
        next: (snapshot) => {
          o.next(snapshot.data() as UserProfile);
          this.changeDetectorRef?.detectChanges();
        },
        error: () => {
          console.error('User not registered', uid);
          o.next(null);
          this.changeDetectorRef?.detectChanges();
          this.register().then(res => {
            console.log('Registration = ', res.data);
            o.error(uid);
            o.complete();
            this.changeDetectorRef?.detectChanges();
          });
        },
        complete: console.error // This should never complete.
      });
    });
  }

  async register() {
    const callable = httpsCallable(this.functions, 'register');
    return callable();
  }

  getHierarchy(id: string) {
    const callable = httpsCallable(this.functions, 'hierarchy');
    return callable({ id })
  }

  upload(request: UploadRequest) {
    console.log('UploadRequest', JSON.stringify(request, null, 2));
    const callable = httpsCallable(this.functions, 'upload');
    return callable(request);
  }

  async login() {
    console.log('Try logging in');
    // Sign in with redirect is problematic for Safari browser.
    const u = await signInWithPopup(this.auth, this.provider);
    console.log('Logged in user', u);
  }

  logout() {
    signOut(this.auth).then(() => {
      console.log('Sign-out successful');
    }).catch((error) => {
      console.error('Signout failed', error);
    });
  }
}
