import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of, shareReplay, switchMap } from 'rxjs';
import { Auth, signInWithPopup, signOut, user } from '@angular/fire/auth';
import { Firestore, collection, collectionSnapshots, doc, docSnapshots, limit, query, where } from '@angular/fire/firestore';
import { GoogleAuthProvider } from "firebase/auth";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { APPROVAL_STATUS, Lokasi, USER_ROLE, UploadRequest, UserProfile, Votes } from '../../functions/src/interfaces';

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

  user$ = user(this.auth).pipe(shareReplay(1));

  profile$: Observable<UserProfile> = this.user$.pipe(
    switchMap(user => !user ? of() :
      this.getUserProfile$(user.uid).pipe(
        catchError(() => {
          console.error('User not registered', user.uid);
          return from(this.register()).pipe(
            switchMap(res => {
              console.log('Registration = ', res.data);
              return this.getUserProfile$(user.uid);
            })
          );
        })
      )
    ),
    shareReplay(1));

  getUserProfile$(uid: string): Observable<UserProfile> {
    console.log('Firestore UserProfile', uid);
    const uRef = doc(this.firestore, `/u/${uid}`);
    return docSnapshots(uRef).pipe(map(snapshot => {
      const u = snapshot.data() as UserProfile;
      console.log(`UserProfile: ${u.name} (${u.email})`);
      return u;
    }));
  }

  getLokasiDataFromFirestore$(id: string): Observable<Lokasi> {
    console.log('Firestore Lokasi', id);
    const hRef = doc(this.firestore, `/h/i${id}`);
    return docSnapshots(hRef).pipe(
      switchMap(snapshot => {
        const h = snapshot.data() as Lokasi;
        return h ? of(h) : of();
      }), shareReplay(1));
  }

  getNextPendingPhoto$(tpsId: string): Observable<UploadRequest> {
    console.log('Firestore PendingPhotos', tpsId);
    const tRef = collection(this.firestore, `/t/${tpsId}/p`);
    const qRef = query(tRef, where('status', '==', APPROVAL_STATUS.NEW), limit(1));
    return collectionSnapshots(qRef).pipe(switchMap(snapshots => {
      if (!snapshots.length) return of();
      const pending = snapshots[0].data() as UploadRequest;
      console.log('Pending review', pending);
      return of(pending);
    }));
  }

  review(tpsId: string, imageId: string, votes: Votes) {
    console.log('RPC review', tpsId, imageId, votes);
    const callable = httpsCallable(this.functions, 'review');
    return callable({ tpsId, imageId, votes });
  }

  searchUsers$(prefix: string, filterRole: number): Observable<UserProfile[]> {
    console.log('Firestore Search', prefix, filterRole);
    const uRef = collection(this.firestore, `/u`);
    const constraints = [];
    if (filterRole >= 0) constraints.push(where('role', '==', filterRole));
    constraints.push(
      where('lowerCaseName', '>=', prefix.toLowerCase()),
      where('lowerCaseName', '<=', prefix.toLowerCase() + '{'),
      limit(5));
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(map(ss => ss.map(s => s.data() as UserProfile)));
  }

  async changeRole(p: UserProfile, role: USER_ROLE) {
    console.log('RPC changRole', p.uid, p.role, role);
    const callable = httpsCallable(this.functions, 'changeRole');
    return callable({ uid: p.uid, role });
  }

  async register() {
    console.log('RPC register');
    const callable = httpsCallable(this.functions, 'register');
    return callable();
  }

  getHierarchy(id: string) {
    console.log('RPC hierarchy: ', id);
    const callable = httpsCallable(this.functions, 'hierarchy');
    return callable({ id })
  }

  upload(request: UploadRequest) {
    console.log('RPC upload:', JSON.stringify(request, null, 2));
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
