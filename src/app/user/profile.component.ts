import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { Observable, combineLatest, of, switchMap } from 'rxjs';
import { Lokasi, UploadRequest, UserProfile } from '../../../functions/src/interfaces';
import { PhotoComponent } from '../photo/photo.component';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface UserUpload {
    lokasi: Lokasi;
    uploadRequest: UploadRequest;
}

interface UserReview {
    idLokasi: string;
    lokasi: Lokasi;
    numReviews: number;
}

interface ProfileDetails {
    profile: UserProfile;
    uploads: UserUpload[];
    reviews: UserReview[];
}

@Component({
    selector: 'app-user-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, MatRadioModule, PhotoComponent, RouterLink,
    MatIconModule, MatButtonModule],
    templateUrl: './profile.component.html',
    styles: `
        .profile {
            padding: 1.5rem 2rem;
        }
        li {
            margin-left: -15px;
        }
    `
})
export class UserProfileComponent implements OnInit {
    @Input() uid = '';

    profile$?: Observable<ProfileDetails>;
    STATUS = ['NEW', 'APPROVED', 'REJECTED', 'MOVED'];

    constructor(public service: AppService) { }

    async ngOnInit() {
        const userProfile$ = (this.uid.length > 0) ?
            this.service.getUserProfile$(this.uid) :
            this.service.profile$;
        this.profile$ = combineLatest([userProfile$, this.service.lokasi$]).pipe(switchMap(([profile, P]) => {
            if (!profile) return of();
            const profileDetails: ProfileDetails = {
                profile,
                uploads: [],
                reviews: [],
            };
            for (const images of Object.values(profile.uploads ?? {})) {
                for (const uploadRequest of Object.values(images)) {
                    profileDetails.uploads.push({
                        lokasi: P.getPrestineLokasi(uploadRequest.idLokasi.substring(0, 10)),
                        uploadRequest
                    });
                }
            }
            profileDetails.uploads.sort((a, b) => {
                return b.uploadRequest.votes[0].updateTs - a.uploadRequest.votes[0].updateTs;
            });
            for (const [idLokasi, numReviews] of Object.entries(profile.reviews ?? {})) {
                profileDetails.reviews.push({
                    idLokasi,
                    lokasi: P.getPrestineLokasi(idLokasi.substring(0, 10)),
                    numReviews
                });
            }
            return of(profileDetails);
        }));
    }

    getFirstName(name: string) {
        const parts = name.split(' ');
        return parts[0];
    }
}
