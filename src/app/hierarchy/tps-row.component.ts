import { Component,  Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ChildLokasi } from './hierarchy.component';
import { AppService } from '../app.service';
import { APPROVAL_STATUS, AggregateVotes, USER_ROLE, PendingAggregateVotes, UserProfile,
  UploadRequest, ImageMetadata, LaporRequest, KPU_UID } from '../../../functions/src/interfaces';
import { UploadComponent } from '../upload/upload.component';
import { ReviewComponent } from '../photo/review.component';
import { PhotoComponent } from '../photo/photo.component';
import { LaporComponent } from '../lapor/lapor.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProfileLinkComponent } from '../user/link.component';

@Component({
  selector: 'app-tps-row',
  standalone: true,
  imports: [CommonModule, MatSidenavModule, MatIconModule, MatButtonModule, LaporComponent,
    ProfileLinkComponent,  UploadComponent, ReviewComponent, PhotoComponent, MatProgressSpinnerModule],
  templateUrl: './tps-row.component.html',
  styleUrl: './tps-list.component.css'
})
export class TpsRowComponent {
  @Input({required: true}) tpsId!: string;
  @Input({required: true}) c!: ChildLokasi;
  @Input({required: true}) userProfile: UserProfile | null = null;

  uploadHistory: UploadRequest[] | null = null;
  reviewUploadRequest: UploadRequest | null = null;
  laporRequest: LaporRequest | null = null;
  isUploadDrawer = true;
  isLaporDrawer = false;
  isDrawerOpen = false;
  isProcessing = 0;

  USER_ROLE = USER_ROLE;
  APPROVAL_STATUS = APPROVAL_STATUS;
  KPU_UID = KPU_UID;

  constructor(public service: AppService) { }

  updateAggregate(agg: PendingAggregateVotes) {
    this.isProcessing++;
    this.c.agg.splice(1, 0, agg);
    agg.onSubmitted.then(() => {
      console.log('On update aggregate success');
      this.isProcessing--;
    }).catch(e => {
      console.error('On update aggregate error', e);
      this.isProcessing--;
    });
  }

  numPendingUploads(a: AggregateVotes) {
    return Object.keys(a.pendingUploads || {}).length;
  }

  async reviewNextPendingUpload() {
    this.reviewUploadRequest = await this.service.getNextPendingPhoto(this.tpsId);
  }

  reReview(a: AggregateVotes) {
    this.reviewUploadRequest = {
        idLokasi: a.idLokasi,
        imageId: a.uploadedPhoto?.imageId ?? '',
        imageMetadata: {} as ImageMetadata,
        servingUrl: a.uploadedPhoto?.photoUrl ?? '',
        votes: [{
            pas1: a.pas1,
            pas2: a.pas2,
            pas3: a.pas3,
            updateTs: 0
        }],
        status: APPROVAL_STATUS.NEW
    };
  }

  lapor(a: AggregateVotes) {
    this.laporRequest = {
        idLokasi: a.idLokasi,
        imageId: a.uploadedPhoto?.imageId ?? '',
        servingUrl: a.uploadedPhoto?.photoUrl ?? '',
        reason: a.uploadedPhoto?.lapor ?? '',
        uid : '',
        isResolved: a.uploadedPhoto?.laporResolved ?? false,
        votes: a,
    };
  }

  async getUploadHistory() {
    this.uploadHistory = await this.service.getUploadHistory(this.tpsId);
  }
}
