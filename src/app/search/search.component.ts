import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AppService } from '../app.service';
import { Observable, map, startWith, switchMap } from 'rxjs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PrestineLokasi } from '../../../functions/src/interfaces';

const idLengths = [2, 4, 6, 10];

interface Result {
    names: string[];
    ids: string[];
    gaps: number;
}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, RouterOutlet, RouterLink, MatButtonModule, MatIconModule,
        MatInputModule, MatFormFieldModule, FormsModule, ReactiveFormsModule],
    templateUrl: './search.component.html',
    styles: `
    li {
        line-height: 3;
        margin-left: -10px;
        padding-right: 10px;
    }`
})
export class SearchComponent implements OnInit {
    @ViewChild('firstInput') firstInput!: ElementRef;

    myControl = new FormControl(this.service.cariTpsQuery);
    results$!: Observable<Result[]>;
    constructor(public router: Router, public service: AppService) { }

    ngOnInit(): void {
        setTimeout(() => this.firstInput.nativeElement.focus(), 100);
        this.results$ = this.service.lokasi$.pipe(switchMap(P => {
            const lokasiStr: {[id: string]: string} = {};
            for (const idDesa of P.getDesaIds()) {
                const lokasi = P.getPrestineLokasi(idDesa);
                lokasiStr[idDesa] = lokasi.names.join('').replace(/\s+/g, '').toUpperCase();
            }
            return this.myControl.valueChanges.pipe(
                startWith(this.service.cariTpsQuery),
                map(query => this.getFilteredLokasi(P, lokasiStr, query || '')),
            );
        }));
    }

    getFilteredLokasi(P: PrestineLokasi, lokasiStr: Record<string, string>, query: string) : Result[] {
        this.service.cariTpsQuery = query;
        const tokens = query.toUpperCase().split(' ');
        const res: Result[] = [];
        for (const idDesa of P.getDesaIds()) {
            const lokasi = P.getPrestineLokasi(idDesa);
            if (!this.isSubstring(lokasiStr[idDesa], tokens)) continue;
            const r: Result = {
                names: lokasi.names,
                ids: [],
                gaps: 1000
            };
            for (let i = 0; i < idLengths.length; i++) {
                r.ids[i] = lokasi.id.substring(0, idLengths[i]);
            }
            res.push(r);
            if (res.length >= 20) break;
        }
        return res;
    }

    isSubstring(str: string, tokens: string[]) {
        let i = 0;
        for (const token of tokens) {
            const j = str.indexOf(token, i);
            if (j < 0) return false;
            i = j + 1;
        }
        return true;
    }
}
