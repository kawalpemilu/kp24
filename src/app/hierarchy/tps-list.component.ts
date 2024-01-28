import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { LokasiData } from './hierarchy.component';
import { AppService } from '../app.service';
import { APPROVAL_STATUS, AggregateVotes, USER_ROLE } from '../../../functions/src/interfaces';
import { UploadComponent } from '../upload/upload.component';
import { ReviewComponent } from '../photo/review.component';
import { PhotoComponent } from '../photo/photo.component';

@Component({
  selector: 'app-tps-list',
  standalone: true,
  imports: [CommonModule, MatSidenavModule, MatIconModule, MatButtonModule,
    UploadComponent, ReviewComponent, PhotoComponent],
  templateUrl: './tps-list.component.html',
})
export class TpsListComponent {
  @Input() lokasi!: LokasiData;
  @Output() onChange = new EventEmitter();

  // Whether to open the upload or review component when the drawer is open.
  isUploadDrawer: Record<string, boolean> = {};

  USER_ROLE = USER_ROLE;
  APPROVAL_STATUS = APPROVAL_STATUS;

  constructor(public service: AppService) { }

  numPendingUploads(a: AggregateVotes) {
    return Object.keys(a.pendingUploads || {}).length;
  }
}
