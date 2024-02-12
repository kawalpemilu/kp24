import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { Observable, combineLatest, of, switchMap } from 'rxjs';
import { Lokasi, UploadRequest, UserProfile } from '../../../functions/src/interfaces';
import { PhotoComponent } from '../photo/photo.component';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface UserUpload {
    lokasi: Lokasi;
    uploadRequest: UploadRequest;
}

interface UserReview {
    idLokasi: string;
    lokasi: Lokasi;
    numReviews: number;
}

interface UserJagaTps {
    tpsId: string;
    lokasi: Lokasi;
}

interface ProfileDetails {
    profile: UserProfile;
    uploads: UserUpload[];
    reviews: UserReview[];
    jagaTps: UserJagaTps[];
}

@Component({
    selector: 'app-user-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, MatRadioModule, PhotoComponent, RouterLink,
        MatExpansionModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.css'
})
export class UserProfileComponent implements OnInit {
    profile$?: Observable<ProfileDetails>;
    STATUS = ['NEW', 'APPROVED', 'REJECTED', 'MOVED'];
    loading = 'new';

    constructor(public service: AppService, private route: ActivatedRoute) { }

    async ngOnInit() {
        const userProfile$ =
            this.route.paramMap.pipe(switchMap(params => {
                const uid = params.get('uid') || '';
                this.loading = (uid.length > 0) ? 'others' : 'self';
                return (uid.length > 0) ?
                    this.service.getUserProfile$(uid) :
                    this.service.profile$;
            }));

        this.profile$ = combineLatest([userProfile$, this.service.lokasi$]).pipe(switchMap(([profile, P]) => {
            if (!profile) return of();
            this.loading = 'done';
            const profileDetails: ProfileDetails = {
                profile,
                uploads: [],
                reviews: [],
                jagaTps: [],
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
            for (const tpsId of Object.keys(profile.jagaTps ?? {})) {
                profileDetails.jagaTps.push({
                    tpsId,
                    lokasi: P.getPrestineLokasi(tpsId.substring(0, 10)),
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
