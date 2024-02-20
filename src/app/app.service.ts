import { Injectable, inject } from '@angular/core';
import { Observable, catchError, combineLatest, firstValueFrom, 
  from, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import { Auth, signInWithPopup, signOut, user } from '@angular/fire/auth';
import { Firestore, QueryConstraint, collection, collectionSnapshots,
  doc, docSnapshots, getDoc, limit, orderBy, query, where } from '@angular/fire/firestore';
import { GoogleAuthProvider } from "firebase/auth";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { APPROVAL_STATUS, LaporRequest, Lokasi, PrestineLokasi, USER_ROLE, UploadRequest, UserProfile, Votes, delayTime } from '../../functions/src/interfaces';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  provider = new GoogleAuthProvider();
  auth: Auth = inject(Auth);
  firestore: Firestore = inject(Firestore);
  functions: Functions = inject(Functions);
  http!: HttpClient;

  public lokasi$!: Observable<PrestineLokasi>;
  public viewportWidth = window.innerWidth;
  public cariTpsQuery = '';
  public rpcIsRunning = false;
  public isPendingTps = false;
  public isErrorTps = false;
  public isCompleteTps = false;
  public isLaporTps = false;

  user$ = user(this.auth).pipe(shareReplay(1));

  profile$: Observable<UserProfile | null> = this.user$.pipe(
    switchMap(user => !user ? of(null) :
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

  getUserProfile$(uid: string): Observable<UserProfile | null> {
    console.warn('Listening to UserProfile', uid);
    const uRef = doc(this.firestore, `/u/${uid}`);
    let counter = 0;
    return docSnapshots(uRef).pipe(switchMap(async snapshot => {
      const u = snapshot.data() as UserProfile;
      console.log(`UserProfile: ${u.name} (${u.email})`);
      if (counter++ > 0) await delayTime(1000);
      return u;
    }), startWith(null));
  }

  getLokasiDataFromFirestore$(id: string): Observable<Lokasi> {
    const hRef = doc(this.firestore, `/h/i${id}`);
    if (id.length === 10) {
      // Single fetch.
      return from(getDoc(hRef)).pipe(
        switchMap(snapshot => {
          const h = snapshot.data() as Lokasi;
          console.log('Firestore TPS Lokasi', id, h);
          return h ? of(h) : of();
        }));
    }
    // Continuous listening.
    return docSnapshots(hRef).pipe(
      switchMap(snapshot => {
        const h = snapshot.data() as Lokasi;
        console.log('Firestore Lokasi', id);
        return h ? of(h) : of();
      }), shareReplay(1));
  }

  async getNextPendingPhoto(tpsId: string): Promise<UploadRequest | null> {
    console.log('Firestore PendingPhotos', tpsId);
    const tRef = collection(this.firestore, `/t/${tpsId}/p`);
    const qRef = query(tRef, where('status', '==', APPROVAL_STATUS.NEW), limit(1));
    const snapshots = await firstValueFrom(collectionSnapshots(qRef));
    if (!snapshots.length) return null;
    const pending = snapshots[0].data() as UploadRequest;
    console.log('Pending review', pending);
    return pending;
  }

  review(tpsId: string, imageId: string, votes: Votes) {
    console.log('RPC review', tpsId, imageId, JSON.stringify(votes, null, 2));
    const callable = httpsCallable(this.functions, 'review');
    return callable({ tpsId, imageId, votes });
  }

  async lapor(request: LaporRequest) {
    this.rpcIsRunning = true;
    console.log('RPC lapor', JSON.stringify(request, null, 2));
    const callable = httpsCallable(this.functions, 'lapor');
    const result = await callable(request);
    this.rpcIsRunning = false;
    return result;
  }

  topUploaders$() {
    console.log('Firestore TopUploaders');
    const constraints = [ orderBy('uploadCount', 'desc'), limit(100)];
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(
      map((snapshots) => snapshots.map(s => s.data() as UserProfile)));
  }

  maxedOutUploaders$() {
    console.log('Firestore TopUploadersNeedReview');
    const constraints = [
      where('uploadCount', '==', 100),
      orderBy('uploadApprovedCount', 'asc'),
      limit(20)];
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(
      map((snapshots) => snapshots.map(s => s.data() as UserProfile)));
  }

  topReviewers$() {
    console.log('Firestore TopReviewers');
    const constraints = [ orderBy('reviewCount', 'desc'), limit(10)];
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(
      map((snapshots) => snapshots.map(s => s.data() as UserProfile)));
  }

  topJagaTps$() {
    console.log('Firestore TopJagaTps');
    const constraints = [ orderBy('jagaTpsCount', 'desc'), limit(10)];
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(
      map((snapshots) => snapshots.map(s => s.data() as UserProfile)));
  }

  topLaporers$() {
    console.log('Firestore TopLaporers');
    const constraints = [ orderBy('laporCount', 'desc'), limit(10)];
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(
      map((snapshots) => snapshots.map(s => s.data() as UserProfile)));
  }

  topUserProfileSize$() {
    console.log('Firestore TopUserProfileSize');
    const constraints = [ orderBy('size', 'desc'), limit(10)];
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(
      map((snapshots) => snapshots.map(s => s.data() as UserProfile)));
  }

  searchUsers$(prefix: string, filterRole: number): Observable<UserProfile[]> {
    console.log('Firestore Search', prefix, filterRole);
    const constraints = [];
    if (filterRole >= 0) constraints.push(where('role', '==', filterRole));
    const nameSearch$ = this.searchUsersByName$(prefix, [...constraints]);
    const uidSearch$ = this.searchUsersByUid$(prefix, [...constraints]);
    const emailSearch$ = this.searchUsersByEmail$(prefix, [...constraints]);
    return combineLatest([nameSearch$, uidSearch$, emailSearch$]).pipe(
      map(([names, uids, emails]) => {
        const results: UserProfile[] = [];
        const uniqueUids: Record<string, boolean> = {};
        for (const u of names.concat(uids).concat(emails)) {
          if (uniqueUids[u.uid]) continue;
          uniqueUids[u.uid] = true;
          results.push(u);
        }
        return results;
      }));
  }

  searchUsersByName$(prefix: string, constraints: QueryConstraint[]) {
    constraints.push(
      where('lowerCaseName', '>=', prefix.toLowerCase()),
      where('lowerCaseName', '<=', prefix.toLowerCase() + '{'),
      limit(5));
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(map(ss => ss.map(s => s.data() as UserProfile)));
  }

  searchUsersByUid$(prefix: string, constraints: QueryConstraint[]) {
    constraints.push(
      where('uid', '>=', prefix),
      where('uid', '<=', prefix + '{'),
      limit(5));
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(map(ss => ss.map(s => s.data() as UserProfile)));
  }

  searchUsersByEmail$(prefix: string, constraints: QueryConstraint[]) {
    constraints.push(
      where('email', '>=', prefix),
      where('email', '<=', prefix + '{'),
      limit(5));
    const uRef = collection(this.firestore, `/u`);
    const qRef = query(uRef, ...constraints);
    return collectionSnapshots(qRef).pipe(map(ss => ss.map(s => s.data() as UserProfile)));
  }

  async getUploadHistory(tpsId: string) {
    console.log('Firestore RejectedPhotos', tpsId);
    this.rpcIsRunning = true;
    const tRef = collection(this.firestore, `/t/${tpsId}/p`);
    const qRef = query(tRef, where('status', '>', APPROVAL_STATUS.APPROVED), limit(10));
    const snapshots = await firstValueFrom(collectionSnapshots(qRef));
    const history: UploadRequest[] = [];
    snapshots.forEach(s => history.push(s.data() as UploadRequest));
    this.rpcIsRunning = false;
    return history;
  }

  async changeRole(p: UserProfile, role: USER_ROLE) {
    console.log('RPC changRole', p.uid, p.role, role);
    const callable = httpsCallable(this.functions, 'changeRole');
    return callable({ uid: p.uid, role: +role });
  }

  async register() {
    console.log('RPC register');
    const callable = httpsCallable(this.functions, 'register');
    return callable();
  }

  async getHierarchy(id: string) {
    this.rpcIsRunning = true;
    const result: any = await firstValueFrom(this.http.get(
      `https://kp24-fd486.et.r.appspot.com/h?id=${id}`));
    console.log('RPC hierarchy: ', id, result);
    this.rpcIsRunning = false;
    return result.result as Lokasi | null;
  }

  upload(request: UploadRequest) {
    console.log('RPC upload:', JSON.stringify(request, null, 2));
    const callable = httpsCallable(this.functions, 'upload');
    return callable(request);
  }

  async jagaTps(tpsId: string) {
    this.rpcIsRunning = true;
    console.log('RPC jagaTps', tpsId);
    const callable = httpsCallable(this.functions, 'jagaTps');
    const result = await callable({ tpsId });
    this.rpcIsRunning = false;
    return result;
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

  getKpuLink(tpsId: string) {
    const idDesa = tpsId.substring(0, 10);
    const tpsNo = tpsId.substring(10).padStart(3, '0');
    return `https://pemilu2024.kpu.go.id/pilpres/hitung-suara/${
        idDesa.substring(0, 2)}/${
        idDesa.substring(0, 4)}/${
        idDesa.substring(0, 6)}/${
        idDesa}/${idDesa + tpsNo}`;
  }
}
