import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { USER_ROLE, UserProfile } from '../../../functions/src/interfaces';
import {
    BehaviorSubject, Observable, combineLatest,
    debounceTime, distinctUntilChanged, shareReplay, switchMap
} from 'rxjs';
import { ProfileLinkComponent } from './link.component';

@Component({
    selector: 'app-user-management',
    standalone: true,
    imports: [CommonModule, FormsModule, MatInputModule, ProfileLinkComponent],
    templateUrl: './management.component.html',
    styleUrl: './management.component.css'
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
            switchMap(([prefix, filterRole]) => this.service.searchUsers$(prefix, +filterRole)),
            shareReplay(1)
        );
    }

    changeRoleFilter(event: any) {
        this.filterRole$.next(event.target.value);
    }

    async changeRole(u: UserProfile) {
        const res = await this.service.changeRole(u, u.role);
        if ((res.data) !== 'bravo') {
            alert(`Change role from ${u.role} to ${u.role} failed`);
        }
    }
}
