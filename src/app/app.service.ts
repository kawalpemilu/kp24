import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of, shareReplay, switchMap } from 'rxjs';
import { Auth, signInWithPopup, signOut, user } from '@angular/fire/auth';
import { Firestore, collection, doc, docSnapshots, getDocs, limit, query, where } from '@angular/fire/firestore';
import { GoogleAuthProvider } from "firebase/auth";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { USER_ROLE, UploadRequest, UserProfile } from '../../functions/src/interfaces';

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

  profile$: Observable<UserProfile> = user(this.auth).pipe(
    switchMap(user => {
      if (!user) return of();
      return this.getUserProfile$(user.uid).pipe(
        catchError(() => {
          console.error('User not registered', user.uid);
          return from(this.register()).pipe(
            switchMap(res => {
              console.log('Registration = ', res.data);
              return this.getUserProfile$(user.uid);
            })
          );
        })
      );

    }),
    shareReplay(1));

  getUserProfile$(uid: string): Observable<UserProfile> {
    const uRef = doc(this.firestore, `/u/${uid}`);
    return docSnapshots(uRef).pipe(map(snapshot => {
      const u = snapshot.data() as UserProfile;
      console.log('Got UserProfile', u);
      return u;
    }),);
  }

  async searchUsers(prefix: string, filterRole: number): Promise<UserProfile[]> {
    console.log('Search', prefix, filterRole);

    const uRef = collection(this.firestore, `/u`);
    const constraints = [];
    if (filterRole >= 0) constraints.push(where('role', '==', filterRole));
    constraints.push(
      where('lowerCaseName', '>=', prefix.toLowerCase()),
      where('lowerCaseName', '<=', prefix.toLowerCase() + '{'),
      limit(5));
    const qRef = query(uRef, ...constraints);
    const results = await getDocs(qRef);
    return results.docs.map(doc => doc.data() as UserProfile);
  }

  async changeRole(p: UserProfile, role: USER_ROLE) {
    console.log('Change Role', p.uid, p.role, role);
    const callable = httpsCallable(this.functions, 'changeRole');
    return callable({ uid: p.uid, role });
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
