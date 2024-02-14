import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { MatTabsModule } from '@angular/material/tabs';
import { USER_ROLE, getNumberOfApprovedPhotos } from '../../../functions/src/interfaces';
import { ProfileLinkComponent } from '../user/link.component';

@Component({
    selector: 'app-leaderboard',
    standalone: true,
    imports: [CommonModule, ProfileLinkComponent, MatTabsModule],
    templateUrl: './leaderboard.component.html',
    styleUrl: './leaderboard.component.css'
})
export class LeaderboardComponent {
    topUploaders$ = this.service.topUploaders$();
    topReviewers$ = this.service.topReviewers$();
    topLaporers$ = this.service.topLaporers$();
    topJagaTps$ = this.service.topJagaTps$();
    topUserProfileSize$ = this.service.topUserProfileSize$();

    USER_ROLE = USER_ROLE;

    constructor(public service: AppService) { }

    getNumberOfApprovedPhotos = getNumberOfApprovedPhotos;
}
