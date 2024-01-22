import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UploadRequest, Votes } from '../../../functions/src/interfaces';
import { AppService } from '../app.service';
import { PhotoComponent } from './photo.component';

@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, PhotoComponent],
    template: `
<div style="width: 250px">
@if (pending$ | async; as p) {
    <app-photo [uploadRequest]="p" [review]="true" (onReview)="approve(p, $event)">
    </app-photo>
} @else {
    <mat-spinner></mat-spinner>
}
</div>
    `,
})
export class ReviewComponent implements OnInit {
    @Input() id = '';
    @Output() onReview = new EventEmitter<boolean>();

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

    async approve(p: UploadRequest, votes: Votes) {
        const result = await this.service.review(this.id, p.imageId, votes);
        console.log('Approve', result.data, p);
        this.onReview.emit(result.data as boolean);
        return true;
    }
}
