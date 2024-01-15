import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, of } from 'rxjs';
import { mergeAll, switchMap } from 'rxjs/operators';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AggregateVotes, Lokasi } from '../../../functions/src/interfaces';
import { CommonModule } from '@angular/common';

const idLengths = [2, 4, 6, 10];

type IdAndAggVotes = [id: string, agg: AggregateVotes];

@Component({
  selector: 'app-hierarchy',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './hierarchy.component.html',
  styleUrl: './hierarchy.component.css'
})
export class HierarchyComponent implements OnInit {
  private functions: Functions = inject(Functions);

  lokasi$!: Observable<Lokasi>;
  parents: string[][] = [];
  children: IdAndAggVotes[] = [];

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit() {
    this.lokasi$ = this.route.paramMap.pipe(
      switchMap(async params => {
        let id = params.get('id') || '';
        if (!(/^\d{0,13}$/.test(id))) id = '';
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
          return of(lokasi);
        } catch (e) {
          console.error('Error', e);
          this.router.navigate(['/h', '']);
          return of();
        }
      }), mergeAll()
    );
  }

  levelName(level: number): string | undefined {
    switch (level) {
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
        return undefined;
    }
  }
}
