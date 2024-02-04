import { Component,  Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ChildLokasi, LokasiData } from './hierarchy.component';
import { AppService } from '../app.service';
import { APPROVAL_STATUS, AggregateVotes, USER_ROLE, PendingAggregateVotes, UserProfile } from '../../../functions/src/interfaces';
import { UploadComponent } from '../upload/upload.component';
import { ReviewComponent } from '../photo/review.component';
import { PhotoComponent } from '../photo/photo.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { map } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tps-list',
  standalone: true,
  imports: [CommonModule, MatSidenavModule, MatIconModule, MatButtonModule,
    MatInputModule, MatFormFieldModule, FormsModule, ReactiveFormsModule, MatCheckboxModule,
    UploadComponent, ReviewComponent, PhotoComponent, MatProgressSpinnerModule],
  templateUrl: './tps-list.component.html',
  styles: ``
})
export class TpsListComponent implements OnChanges {
  @Input() tpsNo = '';
  @Input({required: true}) userProfile!: UserProfile | null;
  @Input({required: true}) lokasi!: LokasiData;

  myControl = new FormControl('');
  isUploadDrawer: Record<string, boolean> = {};
  isDrawerOpen: Record<string, boolean> = {};
  isProcessing: Record<string, number> = {};

  tpsNo$ = this.myControl.valueChanges.pipe(map(v => {
    this.router.navigate(['/h', this.lokasi.id + v]);
    return '';
  }));

  USER_ROLE = USER_ROLE;
  APPROVAL_STATUS = APPROVAL_STATUS;

  constructor(public service: AppService, private router: Router) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tpsNo']) {
      if (this.myControl.getRawValue() != this.tpsNo) {
        console.log('Set tpsNo', this.tpsNo);
        this.myControl.setValue(this.tpsNo);
      }
    }
  }

  onUploadOrReview(tpsId: string, c: ChildLokasi, agg: PendingAggregateVotes) {
    this.isProcessing[tpsId] = this.isProcessing[tpsId] ?? 0;
    this.isProcessing[tpsId]++;
    c.agg.splice(1, 0, agg);
    agg.onSubmitted.then(() => {
      console.log('On upload/review success');
      this.isProcessing[tpsId]--;
    }).catch(e => {
      console.error('On upload/review error', e);
      this.isProcessing[tpsId]--;
    });
  }

  numPendingUploads(a: AggregateVotes) {
    return Object.keys(a.pendingUploads || {}).length;
  }

  filter(arr: ChildLokasi[]) {
    const tpsNo = this.myControl.getRawValue();
    if (!tpsNo && !this.service.isPendingTps &&
      !this.service.isErrorTps && !this.service.isCompleteTps) return arr;
    return arr.filter(c => {
      const a = c.agg[0];
      if (tpsNo && +c.id === +tpsNo) return true;
      if (this.service.isPendingTps && a.totalPendingTps) return true;
      if (this.service.isErrorTps && a.totalErrorTps) return true;
      if (this.service.isCompleteTps && a.totalCompletedTps) return true;
      return false;
    });
  }
}
