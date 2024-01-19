import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, mergeAll, shareReplay, switchMap } from 'rxjs/operators';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AggregateVotes, Lokasi } from '../../../functions/src/interfaces';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { AppService } from '../app.service';
import { UploadComponent } from '../upload/upload.component';

const idLengths = [2, 4, 6, 10];

type IdAndAggVotes = [id: string, agg: AggregateVotes[]];

@Component({
  selector: 'app-hierarchy',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatButtonModule, UploadComponent],
  templateUrl: './hierarchy.component.html',
  styleUrl: './hierarchy.component.css'
})
export class HierarchyComponent implements OnInit {
  private functions: Functions = inject(Functions);

  id$!: Observable<string>;
  lokasi$!: Observable<Lokasi>;

  parents: string[][] = [];
  children: IdAndAggVotes[] = [];
  total = {} as AggregateVotes;

  constructor(private route: ActivatedRoute, private router: Router, private service: AppService) {
  }

  ngOnInit() {
    this.id$ = this.route.paramMap.pipe(
      map(params => {
        let id = params.get('id') || '';
        if (!(/^\d{0,13}$/.test(id))) id = '';

        if (this.service.childrenIds[id]) {
          // Pre render if possible.
          this.parents = [['', 'IDN']];
          for (const len of idLengths) {
            if (len <= id.length) {
              const cid = id.substring(0, len);
              this.parents.push([cid, this.service.id2name[cid]]);
            }
          }
          this.children = [];
          for (const cid of this.service.childrenIds[id]) {
            const idLokasi = id + cid;
            this.children.push([idLokasi, [{
              idLokasi, name: this.service.id2name[idLokasi]
            } as AggregateVotes]]);
          }
        }
        console.log('id', id, this.parents, this.children);
        return id || 'z';
      }), shareReplay(1));

    this.lokasi$ = this.id$.pipe(
      switchMap(async id => {
        try {
          return of(await this.fetchLokasiData(id));
        } catch (e) {
          console.error('Error', e);
          return of();
        }
      }), mergeAll(), shareReplay(1)
    );
  }

  async fetchLokasiData(id: string) {
    const callable = httpsCallable(this.functions, 'hierarchy');
    const lokasi = (await callable({ id })).data as Lokasi;
    console.log('lokasi', lokasi);
    this.parents = [['', 'IDN']];
    for (let i = 0; i < lokasi.names.length; i++) {
      this.parents.push([lokasi.id.substring(0, idLengths[i]), lokasi.names[i]]);
    }
    this.children = Object.entries<AggregateVotes[]>(lokasi.aggregated);
    this.children.sort((a, b) => {
      const aName = a[1][0].name, bName = b[1][0].name;
      if (lokasi.id.length === 10) return +aName - +bName;
      return aName.localeCompare(bName);
    });
    this.total = {
      pas1: 0, pas2: 0, pas3: 0, sah: 0, tidakSah: 0,
      totalCompletedTps: 0, totalTps: 0
    } as AggregateVotes;
    for (const [_, [c]] of this.children) {
      this.total.pas1 += c.pas1 ?? 0;
      this.total.pas2 += c.pas2 ?? 0;
      this.total.pas3 += c.pas3 ?? 0;
      this.total.sah += c.sah ?? 0;
      this.total.tidakSah += c.tidakSah ?? 0;
      this.total.totalCompletedTps += c.totalCompletedTps ?? 0;
      this.total.totalTps += c.totalTps ?? 0;
    }
    return lokasi;
  }

  levelName() {
    switch (this.parents.length) {
      case 1:
        return 'Provinsi';
      case 2:
        return 'Kota/Kabupaten';
      case 3:
        return 'Kecamatan';
      case 4:
        return 'Kelurahan/Desa';
      case 5:
        return 'TPS';
      default:
        return 'Lokasi';
    }
  }
}
