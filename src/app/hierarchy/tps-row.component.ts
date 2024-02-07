import { Component,  Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ChildLokasi } from './hierarchy.component';
import { AppService } from '../app.service';
import { APPROVAL_STATUS, AggregateVotes, USER_ROLE, PendingAggregateVotes, UserProfile } from '../../../functions/src/interfaces';
import { UploadComponent } from '../upload/upload.component';
import { ReviewComponent } from '../photo/review.component';
import { PhotoComponent } from '../photo/photo.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tps-row',
  standalone: true,
  imports: [CommonModule, MatSidenavModule, MatIconModule, MatButtonModule,
    UploadComponent, ReviewComponent, PhotoComponent, MatProgressSpinnerModule],
  templateUrl: './tps-row.component.html',
  styleUrl: './tps-list.component.css'
})
export class TpsRowComponent {
  @Input({required: true}) tpsId!: string;
  @Input({required: true}) c!: ChildLokasi;
  @Input({required: true}) userProfile!: UserProfile | null;

  isUploadDrawer = true;
  isDrawerOpen = false;
  isProcessing = 0;

  USER_ROLE = USER_ROLE;
  APPROVAL_STATUS = APPROVAL_STATUS;

  constructor(public service: AppService, private router: Router) { }

  onUploadOrReview(agg: PendingAggregateVotes) {
    this.isProcessing = this.isProcessing ?? 0;
    this.isProcessing++;
    this.c.agg.splice(1, 0, agg);
    agg.onSubmitted.then(() => {
      console.log('On upload/review success');
      this.isProcessing--;
    }).catch(e => {
      console.error('On upload/review error', e);
      this.isProcessing--;
    });
  }

  numPendingUploads(a: AggregateVotes) {
    return Object.keys(a.pendingUploads || {}).length;
  }

  roiUrl(photoUrl: string | undefined) {
    return !photoUrl ? '' :
        `https://storage.googleapis.com/kawalc1/static/2024/transformed/${
        this.tpsId.substring(0,10)}/${
        this.tpsId.substring(10)}/extracted/${
        photoUrl.replace('http://lh3.googleusercontent.com/', '')
        }%3Ds1280~paslon.webp`
  }
}
