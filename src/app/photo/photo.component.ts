import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { APPROVAL_STATUS, AggregateVotes, ImageMetadata, UploadRequest, Votes } from '../../../functions/src/interfaces';

@Component({
    selector: 'app-photo',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule],
    templateUrl: './photo.component.html',
})
export class PhotoComponent implements OnChanges {
    @Input() aggregatedVotes?: AggregateVotes;
    @Input() uploadRequest?: UploadRequest;
    @Input() review = false;
    @Output() onReview = new EventEmitter<Votes>();

    photoUrl = '';
    uid = '';
    imageMetadata = {} as ImageMetadata;
    pas1 = 0;
    pas2 = 0;
    pas3 = 0;

    get largePhoto() {
        if (!this.isServingUrl) return this.photoUrl;
        return this.photoUrl + '=s1280';
    }

    get thumbnail() {
        if (!this.isServingUrl) return this.photoUrl;
        return this.photoUrl + '=s200';
    }

    get isServingUrl() {
        return !this.photoUrl.endsWith('.png') &&
            !this.photoUrl.startsWith('data:');
    }

    ngOnChanges(): void {
        if (this.aggregatedVotes) {
            this.uid = this.aggregatedVotes.uid ?? '';
            this.pas1 = this.aggregatedVotes.pas1;
            this.pas2 = this.aggregatedVotes.pas2;
            this.pas3 = this.aggregatedVotes.pas3;
            const u = this.aggregatedVotes.uploadedPhoto;
            if (u) {
                this.photoUrl = u.photoUrl;
            }
        } else if (this.uploadRequest) {
            const v = this.uploadRequest.votes[0];
            this.uid = v.uid ?? '';
            this.pas1 = v.pas1;
            this.pas2 = v.pas2;
            this.pas3 = v.pas3;
            this.photoUrl = this.uploadRequest.servingUrl;
            this.imageMetadata = this.uploadRequest.imageMetadata;
        }
    }

    approve(verdict: boolean) {
        const votes: Votes = {
            pas1: this.pas1,
            pas2: this.pas2,
            pas3: this.pas3,
            status: verdict ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED,
            updateTs: 0
        };
        this.onReview.emit(votes);
    }
}
