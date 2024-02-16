import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { APPROVAL_STATUS, LaporRequest, PendingAggregateVotes, USER_ROLE, UserProfile } from '../../../functions/src/interfaces';
import { AppService } from '../app.service';
import { PhotoComponent } from '../photo/photo.component';
import { DigitizeComponent } from '../upload/digitize.component';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-lapor',
    standalone: true,
    imports: [CommonModule, MatButtonModule, FormsModule,
        MatProgressSpinnerModule, PhotoComponent, DigitizeComponent],
    templateUrl: './lapor.component.html',
})
export class LaporComponent {
    @Input({ required: true }) userProfile!: UserProfile | null;
    @Input({ required: true }) request!: LaporRequest;
    @Output() onLapor = new EventEmitter<PendingAggregateVotes>();

    USER_ROLE = USER_ROLE;

    constructor(public service: AppService) { }

    laporkan(resolve: boolean) {
        if (!this.request.reason?.trim().length) {
            alert('Tolong diisi alasan kenapa foto ini ada kesalahan.');
            return;
        }
        if (this.request.reason.length > 300) {
            alert(`Jumlah karakter (${this.request.reason.length}) melebihi 300.`);
            return;
        }
        this.request.isResolved = resolve;
        this.request.votes.status = APPROVAL_STATUS.LAPOR;
        const onSubmitted = this.service
            .lapor(this.request)
            .then(v => {
                if (!v.data) {
                    alert('Fail to lapor photo');
                    return '';
                }
                return 'ok';
            }).catch(e => {
                alert('Unable to lapor photo');
                console.error('Unable lapor photo', e);
                return '';
            });
        this.onLapor.emit({
            idLokasi: this.request.idLokasi,
            name: '',
            totalTps: 0,
            totalPendingTps: 0,
            totalErrorTps: 0,
            totalCompletedTps: 0,
            totalJagaTps: 0,
            totalLaporTps: 0,
            totalKpuTps: 0,
            pas1: this.request.votes.pas1,
            pas2: this.request.votes.pas2,
            pas3: this.request.votes.pas3,
            updateTs: 0,
            status: this.request.votes.status,
            uploadedPhoto: {
                imageId: this.request.imageId,
                photoUrl: this.request.servingUrl
            },
            onSubmitted
        });
    }
}
