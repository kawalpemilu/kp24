import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { USER_ROLE, UserProfile } from '../../../functions/src/interfaces';
import {
    BehaviorSubject, Observable, combineLatest,
    debounceTime, distinctUntilChanged, shareReplay, switchMap
} from 'rxjs';

@Component({
    selector: 'app-user-management',
    standalone: true,
    imports: [CommonModule, FormsModule, MatRadioModule, MatInputModule],
    templateUrl: './management.component.html',
})
export class UserManagementComponent implements OnInit {
    cari$ = new BehaviorSubject<string>('');
    filterRole$ = new BehaviorSubject<number>(-1);
    users$!: Observable<UserProfile[]>;

    USER_ROLE = USER_ROLE;

    constructor(public service: AppService) { }

    ngOnInit() {
        const prefix$ = this.cari$.pipe(debounceTime(500), distinctUntilChanged());
        this.users$ = combineLatest([prefix$, this.filterRole$]).pipe(
            switchMap(([prefix, filterRole]) => this.service.searchUsers$(prefix, filterRole)),
            shareReplay(1)
        );
    }

    changeRoleFilter(event: any) {
        this.filterRole$.next(event.target.value);
    }

    async changeRole(u: UserProfile, role: USER_ROLE) {
        const res = await this.service.changeRole(u, role);
        if ((res.data) !== 'bravo') {
            alert(`Change role from ${u.role} to ${role} failed`);
        }
    }
}
