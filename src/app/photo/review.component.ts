import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PendingAggregateVotes, UploadRequest, Votes } from '../../../functions/src/interfaces';
import { AppService } from '../app.service';
import { PhotoComponent } from './photo.component';
import { DigitizeComponent } from '../upload/digitize.component';

@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule, MatButtonModule,
        MatProgressSpinnerModule, PhotoComponent, DigitizeComponent],
    templateUrl: './review.component.html',
})
export class ReviewComponent implements OnInit {
    @Input({required: true}) id = '';
    @Output() onReview = new EventEmitter<PendingAggregateVotes>();

    pending$!: Observable<UploadRequest>;

    constructor(private service: AppService) { }

    ngOnInit() {
        console.log('Review', this.id);
        if (this.id.length <= 10) {
            console.error('ID is not a TPS:', this.id);
            return;
        }

        this.pending$ = this.service.getNextPendingPhoto$(this.id);
    }

    approve(p: UploadRequest, votes: Votes) {
        const onSubmitted = this.service
            .review(this.id, p.imageId, votes)
            .then(v => v.data ? 'ok' : '').catch(e => {
                alert('Unable to review votes');
                console.error('Unable review votes', e);
                return '';
            });
        this.onReview.emit({
            idLokasi: p.idLokasi,
            name: '',
            totalTps: 0,
            totalPendingTps: 0,
            totalErrorTps: 0,
            totalCompletedTps: 0,
            pas1: votes.pas1,
            pas2: votes.pas2,
            pas3: votes.pas3,
            updateTs: 0,
            status: votes.status,
            uploadedPhoto: { imageId: p.imageId, photoUrl: p.servingUrl },
            onSubmitted
        });
    }
}
