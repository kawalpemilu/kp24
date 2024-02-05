import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { APPROVAL_STATUS, PendingAggregateVotes, PrestineLokasi, UploadRequest, Votes } from '../../../functions/src/interfaces';
import { AppService } from '../app.service';
import { PhotoComponent } from './photo.component';
import { DigitizeComponent } from '../upload/digitize.component';
import { FormsModule } from '@angular/forms';

interface OptionLokasi {
    id: string;
    name: string;
}

@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule, MatButtonModule, FormsModule,
        MatProgressSpinnerModule, PhotoComponent, DigitizeComponent],
    templateUrl: './review.component.html',
    styleUrl: './review.component.css',
})
export class ReviewComponent implements OnInit {
    @Input({ required: true }) id = '';
    @Output() onReview = new EventEmitter<PendingAggregateVotes>();

    pending$!: Observable<UploadRequest>;
    ubahLokasi = false;
    newId = '';
    newPropId = '';
    newKabId = '';
    newKecId = '';
    newKelId = '';
    newTpsNo = '';

    constructor(public service: AppService) { }

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
            .then(v => {
                if (!v.data) {
                    alert('Fail to submit the review');
                    return '';
                }
                return 'ok';
            }).catch(e => {
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

    startUbahLokasi() {
        this.ubahLokasi = true;
        this.newPropId = this.id.substring(0, 2);
        this.newKabId = this.id.substring(0, 4);
        this.newKecId = this.id.substring(0, 6);
        this.newKelId = this.id.substring(0, 10);
        this.newTpsNo = this.id.substring(10);
    }
    getPropinsiList(P: PrestineLokasi): OptionLokasi[] {
        const lokasi = P.getPrestineLokasi('');
        return Object.values(lokasi.aggregated).map(a => {
            return { id: a[0].idLokasi, name: a[0].name } as OptionLokasi;
        });
    }
    getKabupatenList(P: PrestineLokasi): OptionLokasi[] | undefined {
        if (this.newPropId.length < 2) return undefined;
        const lokasi = P.getPrestineLokasi(this.newPropId);
        return Object.values(lokasi.aggregated).map(a => {
            return { id: a[0].idLokasi, name: a[0].name } as OptionLokasi;
        });
    }
    getKecamatanList(P: PrestineLokasi): OptionLokasi[] | undefined {
        if (this.newKabId.length < 4) return undefined;
        const lokasi = P.getPrestineLokasi(this.newKabId);
        return Object.values(lokasi.aggregated).map(a => {
            return { id: a[0].idLokasi, name: a[0].name } as OptionLokasi;
        });
    }
    getKelurahanList(P: PrestineLokasi): OptionLokasi[] | undefined {
        if (this.newKecId.length < 6) return undefined;
        const lokasi = P.getPrestineLokasi(this.newKecId);
        return Object.values(lokasi.aggregated).map(a => {
            return { id: a[0].idLokasi, name: a[0].name } as OptionLokasi;
        });
    }
    updateNewId(event: any) {
        this.newId = event.target.value;
        if (this.newId.length <= 2) this.newKabId = '';
        if (this.newId.length <= 4) this.newKelId = '';
        if (this.newId.length <= 6) this.newKelId = '';
    }
    isValid(P: PrestineLokasi) {
        if (this.newKelId.length !== 10) return false;
        if (this.newTpsNo?.length <= 0) return false;
        const lokasi = P.getPrestineLokasi(this.newKelId);
        return !!lokasi.aggregated[this.newTpsNo];
    }
    updateLokasi(p: UploadRequest) {
        this.service
            .upload({
                idLokasi: this.newKelId + this.newTpsNo,
                imageId: p.imageId,
                imageMetadata: p.imageMetadata,
                servingUrl: p.servingUrl,
                votes: [ { ...p.votes[0], status: APPROVAL_STATUS.MOVED } ],
                status: APPROVAL_STATUS.MOVED,
            });
        this.approve(p, { ...p.votes[0], status: APPROVAL_STATUS.MOVED });
    }
}
