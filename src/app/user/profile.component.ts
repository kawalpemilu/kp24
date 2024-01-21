import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { Observable } from 'rxjs';
import { UserProfile } from '../../../functions/src/interfaces';

@Component({
    selector: 'app-user-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, MatRadioModule],
    templateUrl: './profile.component.html',
})
export class UserProfileComponent implements OnInit {
    @Input() uid = '';

    profile$?: Observable<UserProfile | null>;

    constructor(private service: AppService) { }

    ngOnInit() {
        if (this.uid.length > 0) {
            this.profile$ = this.service.getUserProfile$(this.uid);
        } else {
            this.profile$ = this.service.profile$;
        }
    }
}
