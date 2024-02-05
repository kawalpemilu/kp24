import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { BehaviorSubject, combineLatest, EMPTY, from, Observable, of } from 'rxjs';
import { shareReplay, switchMap, startWith, catchError, map, distinctUntilChanged } from 'rxjs/operators';
import { APPROVAL_STATUS, AggregateVotes, Lokasi, LruCache, UploadRequest, UserProfile } from '../../../functions/src/interfaces';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { MatIconModule } from '@angular/material/icon';
import { PercentComponent } from './percent.component';
import { TpsListComponent } from './tps-list.component';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

const idLengths = [2, 4, 6, 10];
const levelNames = ['Nasional', 'Provinsi', 'Kabupaten', 'Kecamatan', 'Kelurahan/Desa', 'TPS'];

export interface ChildLokasi {
  id: string;
  agg: AggregateVotes[];
  userUploads: UploadRequest[];
}

export interface LokasiData {
  id: string;
  parents: string[][];
  children: ChildLokasi[];
  total: AggregateVotes;
  level: string;
}

function newLokasiData(id: string): LokasiData {
  return {
    id, parents: [['', 'IDN']], children: [],
    total: {} as AggregateVotes,
    level: ''
  };
}

@Component({
  selector: 'app-hierarchy',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatButtonModule, MatProgressSpinnerModule,
    MatIconModule, PercentComponent, TpsListComponent],
  templateUrl: './hierarchy.component.html',
  styleUrl: './hierarchy.component.css'
})
export class HierarchyComponent implements OnInit {
  lokasi$!: Observable<LokasiData>;
  lokasiCache = new LruCache<string, LokasiData>(100);

  // Used for trigger the refetching the LokasiData.
  lokasiWithVotesTrigger$ = new BehaviorSubject<string>('');

  userProfile: UserProfile | null = null;
  tpsNo = '';

  constructor(
    private route: ActivatedRoute,
    public service: AppService) {
  }

  ngOnInit() {
    const id$ = this.route.paramMap.pipe(
      map(params => {
        let id = params.get('id') || '';
        if (!(/^\d{0,13}$/.test(id))) id = '';
        if (id.length > 10) {
          this.tpsNo = id.substring(10);
          id = id.substring(0, 10);
        } else {
          this.tpsNo = '';
        }
        return id;
      }), distinctUntilChanged());

    this.lokasi$ = combineLatest([id$, this.service.profile$, this.lokasiWithVotesTrigger$]).pipe(
      switchMap(([id, profile]) => {
        this.userProfile = profile;
        // Creates two observables from the given location id.
        // The first observable is fetching from static hierarchy,
        // this observable can emit value very fast because it constructs
        // the value from locally-cached static hierarchy without any votes.
        const lokasi1$ = this.getLokasiDataWithoutVotes(id);
        // The second observable is fetching from Firebase function,
        // which is slow (may take a few seconds depending on the network latency).
        // The result of this second observable will replace the first observable.
        const lokasi2$ = this.getLokasiDataWithVotes(id);
        // Both observable have initial value of null so that
        // the combineLatest kicks in immediately.
        return combineLatest([
          lokasi1$.pipe(startWith(null)),
          lokasi2$.pipe(startWith(null))
        ]).pipe(
          catchError(error => {
            // On error, do not emit anything.
            console.error('Error occurred:', error);
            return EMPTY;
          }), switchMap(([lokasi1, lokasi2]) => {
            // Prefer lokasi2 if it's not null.
            const lokasi = lokasi2 ? lokasi2 : lokasi1;
            // Do not emit anything if it's null.
            if (!lokasi) return of();
            this.populateUserUploads(lokasi, profile);
            return of(lokasi);
          }), shareReplay(1));
      }));
  }

  populateUserUploads(lokasi: LokasiData, profile: UserProfile | null) {
    for (const c of lokasi.children) {
      const cid = lokasi.id + c.id;
      c.userUploads = [];

      const pendingUploads = c.agg[0].pendingUploads;
      if (!pendingUploads || !profile?.uploads) continue;
      for (const u of Object.values(profile.uploads[cid] ?? {})) {
        if (u.status !== APPROVAL_STATUS.APPROVED) {
          c.userUploads.push(u);
        }
      }
      c.userUploads.sort((a, b) => (b.votes[0].updateTs - a.votes[0].updateTs))
    }
  }

  /**
   * @param id the lokasi id.
   * @returns {Observable<LokasiData | null>} the LokasiData from static hierarchy.
   * or null if the static hierarchy does not exist.
   */
  getLokasiDataWithoutVotes(id: string): Observable<LokasiData | null> {
    if (!this.service.lokasi$) return of();
    return this.service.lokasi$.pipe(map(
      LOKASI => this.toLokasiData(LOKASI.getPrestineLokasi(id))
    ));
  }

  getLokasiDataFromFirestore$(id: string): Observable<LokasiData> {
    return this.service.getLokasiDataFromFirestore$(id)
      .pipe(map(this.toLokasiData.bind(this)));
  }

  getLokasiDataFromRpc$(id: string): Observable<LokasiData> {
    return from(this.service.getHierarchy(id))
      .pipe(map(result => this.toLokasiData(result.data as Lokasi)));
  }

  /**
   * @param id the lokasi id.
   * @returns {Observable<LokasiData>} the cached LokasiData if exists,
   * and then emit another more fresh LokasiData from the server and cache it.
   */
  getLokasiDataWithVotes(id: string): Observable<LokasiData> {
    return this.service.user$.pipe(
      switchMap(user =>
        (user && id.length < 10)
          ? this.getLokasiDataFromFirestore$(id)
          : this.getLokasiDataFromRpc$(id)),
      switchMap(async (lokasi) => {
        // Artificial delay to test slow loading.
        // await new Promise((resolve) => setTimeout(resolve, 2000));
        // Sets the newly fetch lokasi with votes to cache and emit it.
        this.lokasiCache.set(id, lokasi);
        return lokasi;
      }),
      // Starts with the cached lokasi if exists.
      startWith(this.lokasiCache.get(id)),
      switchMap(lokasi => lokasi ? of(lokasi) : of())
    );
  }

  toLokasiData(lokasiWithVotes: Lokasi) {
    const lokasi = newLokasiData(lokasiWithVotes.id);
    lokasi.parents = [['', 'IDN']];
    for (let i = 0; i < lokasiWithVotes.names.length; i++) {
      lokasi.parents.push([
        lokasi.id.substring(0, idLengths[i]), lokasiWithVotes.names[i]]);
    }
    lokasi.level = levelNames[lokasi.parents.length];
    lokasi.children = Object.entries<AggregateVotes[]>(lokasiWithVotes.aggregated)
      .map(a => ({ id: a[0], agg: a[1], userUploads: [] }));
    lokasi.children.sort((a, b) => {
      const aName = a.agg[0].name, bName = b.agg[0].name;
      if (lokasi.id.length === 10) return +aName - +bName;
      return aName.localeCompare(bName);
    });
    lokasi.total = {
      pas1: 0, pas2: 0, pas3: 0,
      totalCompletedTps: 0,
      totalPendingTps: 0,
      totalErrorTps: 0,
      totalTps: 0
    } as AggregateVotes;
    for (const { agg } of lokasi.children) {
      lokasi.total.pas1 += agg[0].pas1 ?? 0;
      lokasi.total.pas2 += agg[0].pas2 ?? 0;
      lokasi.total.pas3 += agg[0].pas3 ?? 0;
      lokasi.total.totalCompletedTps += agg[0].totalCompletedTps ?? 0;
      lokasi.total.totalPendingTps += agg[0].totalPendingTps ?? 0;
      lokasi.total.totalErrorTps += agg[0].totalErrorTps ?? 0;
      lokasi.total.totalTps += agg[0].totalTps ?? 0;
    }
    return lokasi;
  }

  reloadLokasi() {
    this.lokasiWithVotesTrigger$.next('');
  }
}
