import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, of } from 'rxjs';
import { mergeAll, switchMap } from 'rxjs/operators';
import { Functions, httpsCallable, connectFunctionsEmulator } from '@angular/fire/functions';
import { Lokasi } from '../../../functions/src/interfaces';
import { CommonModule } from '@angular/common';

const idLengths = [2, 4, 6, 10];

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
  children: string[][] = [];

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit() {
    this.lokasi$ = this.route.paramMap.pipe(
      switchMap(async params => {
        let id = params.get('id') || '';
        if (!(/^\d{0,13}$/.test(id))) id = '';
        // connectFunctionsEmulator(this.functions, "127.0.0.1", 5001);
        try {
          const callable = httpsCallable(this.functions, 'hierarchy');
          const lokasi = (await callable({ id })).data as Lokasi;
          this.parents = [['', 'IDN']];
          for (let i = 0; i < lokasi.names.length; i++) {
            this.parents.push([lokasi.id.substring(0, idLengths[i]), lokasi.names[i]]);
          }
          this.children = [];
          for (const [id, agg] of Object.entries(lokasi.aggregated)) {
            this.children.push([id, agg.name]);
          }
          this.children.sort((a, b) => {
            if (lokasi.id.length === 10) return +a[1] - +b[1];
            return (a[1] < b[1]) ? -1 : (a[1] > b[1]) ? 1 : 0;
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
}
