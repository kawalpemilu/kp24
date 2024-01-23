import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { BehaviorSubject, combineLatest, EMPTY, from, Observable, of } from 'rxjs';
import { shareReplay, switchMap, startWith, catchError, map } from 'rxjs/operators';
import { AggregateVotes, Lokasi, LruCache } from '../../../functions/src/interfaces';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { AppService } from '../app.service';
import { UploadComponent } from '../upload/upload.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { ReviewComponent } from '../photo/review.component';
import { PhotoComponent } from '../photo/photo.component';

const idLengths = [2, 4, 6, 10];
const levelNames = ['Nasional', 'Provinsi', 'Kabupaten', 'Kecamatan', 'Kelurahan/Desa', 'TPS'];
type IdAndAggVotes = [id: string, agg: AggregateVotes[]];

interface LokasiData {
  id: string;
  parents: string[][];
  children: IdAndAggVotes[];
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
  imports: [CommonModule, RouterLink, RouterLinkActive, MatButtonModule, UploadComponent,
    MatSidenavModule, MatIconModule, ReviewComponent, PhotoComponent],
  templateUrl: './hierarchy.component.html',
  styleUrl: './hierarchy.component.css'
})
export class HierarchyComponent implements OnInit {
  lokasi$!: Observable<LokasiData>;
  lokasiCache = new LruCache<string, LokasiData>(100);

  // Used for trigger the refetching the LokasiData.
  lokasiWithVotesTrigger$ = new BehaviorSubject(null);

  // Whether to open the upload or review component when the drawer is open.
  isUploadDrawer: Record<string, boolean> = {};

  constructor(
    private route: ActivatedRoute,
    private service: AppService) {
  }

  ngOnInit() {
    const id$ = this.route.paramMap.pipe(
      map(params => {
        let id = params.get('id') || '';
        if (!(/^\d{0,13}$/.test(id))) id = '';
        return id;
      }));

    this.lokasi$ = combineLatest([id$, this.lokasiWithVotesTrigger$]).pipe(
      switchMap(([id]) => {
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
            return lokasi ? of(lokasi) : of();
          }), shareReplay(1));
      }));
  }

  /**
   * @param id the lokasi id.
   * @returns {Observable<LokasiData | null>} the LokasiData from static hierarchy.
   * or null if the static hierarchy does not exist.
   */
  getLokasiDataWithoutVotes(id: string): Observable<LokasiData | null> {
    if (!this.service.hierarchy$) return of();
    return this.service.hierarchy$.pipe(map(
      ({ id2name, childrenIds }) => {
        const lokasi = newLokasiData(id);
        for (const len of idLengths) {
          if (len <= id.length) {
            const cid = id.substring(0, len);
            lokasi.parents.push([cid, id2name[cid]]);
          }
        }
        lokasi.level = levelNames[lokasi.parents.length];
        if (childrenIds[id]) {
          for (const cid of childrenIds[id]) {
            const idLokasi = id + cid;
            lokasi.children.push([idLokasi, [{
              idLokasi, name: id2name[idLokasi]
            } as AggregateVotes]]);
          }
        }
        console.log('id prestine', lokasi.id);
        return lokasi;
      }
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
          // TODO: only >=MODERATOR.
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
    lokasi.children = Object.entries<AggregateVotes[]>(lokasiWithVotes.aggregated);
    lokasi.children.sort((a, b) => {
      const aName = a[1][0].name, bName = b[1][0].name;
      if (lokasi.id.length === 10) return +aName - +bName;
      return aName.localeCompare(bName);
    });
    lokasi.total = {
      pas1: 0, pas2: 0, pas3: 0,
      totalCompletedTps: 0, totalTps: 0
    } as AggregateVotes;
    for (const [_, [c]] of lokasi.children) {
      lokasi.total.pas1 += c.pas1 ?? 0;
      lokasi.total.pas2 += c.pas2 ?? 0;
      lokasi.total.pas3 += c.pas3 ?? 0;
      lokasi.total.totalCompletedTps += c.totalCompletedTps ?? 0;
      lokasi.total.totalTps += c.totalTps ?? 0;
    }
    return lokasi;
  }

  reloadLokasi() {
    this.lokasiWithVotesTrigger$.next(null);
  }

  numPendingUploads(a: AggregateVotes) {
    return Object.keys(a.pendingUploads || {}).length;
  }
}
