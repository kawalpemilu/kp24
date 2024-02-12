import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { USER_ROLE } from '../../../functions/src/interfaces';

@Component({
    selector: 'app-leaderboard',
    standalone: true,
    imports: [CommonModule, FormsModule, MatTabsModule],
    templateUrl: './leaderboard.component.html',
    styleUrl: './leaderboard.component.css'
})
export class LeaderboardComponent {
    topUploaders$ = this.service.topUploaders$();
    topReviewers$ = this.service.topReviewers$();
    topLaporers$ = this.service.topLaporers$();

    USER_ROLE = USER_ROLE;

    constructor(public service: AppService) { }
}
