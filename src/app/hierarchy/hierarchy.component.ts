import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, of } from 'rxjs';
import { mergeAll, switchMap } from 'rxjs/operators';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AggregateVotes, Lokasi } from '../../../functions/src/interfaces';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { id2name } from "./id2name"
import { AppService } from '../app.service';

const idLengths = [2, 4, 6, 10];

type IdAndAggVotes = [id: string, agg: AggregateVotes];

@Component({
  selector: 'app-hierarchy',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatButtonModule],
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
      switchMap(async params => {
        let id = params.get('id') || '';
        if (!(/^\d{0,13}$/.test(id))) id = '';

        if (this.service.childrenIds[id]) {
          // Pre render if possible.
          this.parents = [['', 'IDN']];
          for (const len of idLengths) {
            if (len <= id.length) {
              const cid = id.substring(0, len);
              this.parents.push([cid, id2name[cid]]);
            }
          }
          this.children = [];
          for (const cid of this.service.childrenIds[id]) {
            const idLokasi = id + cid;
            this.children.push([idLokasi, { idLokasi, name: id2name[idLokasi] } as AggregateVotes]);
          }
        }
        return id || 'z';
      }));

    this.lokasi$ = this.id$.pipe(
      switchMap(async id => {
        try {
          const callable = httpsCallable(this.functions, 'hierarchy');
          const lokasi = (await callable({ id })).data as Lokasi;
          this.parents = [['', 'IDN']];
          for (let i = 0; i < lokasi.names.length; i++) {
            this.parents.push([lokasi.id.substring(0, idLengths[i]), lokasi.names[i]]);
          }
          this.children = Object.entries<AggregateVotes>(lokasi.aggregated);
          this.children.sort((a, b) => {
            if (lokasi.id.length === 10) return +a[1].name - +b[1].name;
            return a[1].name.localeCompare(b[1].name);
          });
          this.total = {
            pas1: 0, pas2: 0, pas3: 0, sah: 0, tidakSah: 0,
            totalCompletedTps: 0, totalTps: 0
          } as AggregateVotes;
          for (const [_, c] of this.children) {
            this.total.pas1 += c.pas1 ?? 0;
            this.total.pas2 += c.pas2 ?? 0;
            this.total.pas3 += c.pas3 ?? 0;
            this.total.sah += c.sah ?? 0;
            this.total.tidakSah += c.tidakSah ?? 0;
            this.total.totalCompletedTps += c.totalCompletedTps ?? 0;
            this.total.totalTps += c.totalTps ?? 0;
          }
          return of(lokasi);
        } catch (e) {
          console.error('Error', e);
          return of();
        }
      }), mergeAll()
    );
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
