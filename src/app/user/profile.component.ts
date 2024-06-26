import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { Observable, combineLatest, of, switchMap } from 'rxjs';
import { Lokasi, USER_ROLE, UploadRequest, UserProfile } from '../../../functions/src/interfaces';
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
    uploaded: boolean;
}

interface UserLapor {
    key: string;
    tpsId: string;
    imageId: string;
    lokasi: Lokasi;
    reason: string;
    laporTs: number;
}

interface ProfileDetails {
    profile: UserProfile; // The profile being viewed.
    uploads: UserUpload[];
    reviews: UserReview[];
    jagaTps: UserJagaTps[];
    laporan: UserLapor[];
    loggedInProfile: UserProfile | null; // The logged-in profile.
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
    USER_ROLE = USER_ROLE;

    constructor(public service: AppService, private route: ActivatedRoute) { }

    async ngOnInit() {
        const userProfile$ =
            this.route.paramMap.pipe(switchMap(params => {
                const uid = params.get('uid') || '';
                return (uid.length > 0) ?
                    this.service.getUserProfile$(uid) :
                    this.service.profile$;
            }));

        this.profile$ = combineLatest([
            userProfile$,
            this.service.lokasi$,
            this.service.profile$]).pipe(switchMap(([profile, P, loggedInProfile]) => {
            if (!profile) return of();
            const profileDetails: ProfileDetails = {
                profile,
                uploads: [],
                reviews: [],
                jagaTps: [],
                laporan: [],
                loggedInProfile
            };
            for (const images of Object.values(profile.uploads ?? {})) {
                for (const uploadRequest of Object.values(images)) {
                    const lokasi = P.getPrestineLokasi(uploadRequest.idLokasi.substring(0, 10));
                    if (!lokasi) continue;
                    profileDetails.uploads.push({ lokasi, uploadRequest });
                }
            }
            profileDetails.uploads.sort((a, b) => {
                return b.uploadRequest.votes[0].updateTs - a.uploadRequest.votes[0].updateTs;
            });
            for (const [idLokasi, numReviews] of Object.entries(profile.reviews ?? {})) {
                const lokasi = P.getPrestineLokasi(idLokasi.substring(0, 10));
                if (!lokasi) continue;
                profileDetails.reviews.push({ idLokasi, lokasi, numReviews });
            }
            for (const tpsId of Object.keys(profile.jagaTps ?? {})) {
                const lokasi = P.getPrestineLokasi(tpsId.substring(0, 10));
                if (!lokasi) continue;
                const uploaded = profileDetails.uploads.some(upload =>
                  upload.uploadRequest.idLokasi.startsWith(tpsId)
                );
                profileDetails.jagaTps.push({ tpsId, lokasi, uploaded });
            }
            profileDetails.jagaTps.sort((a, b) => a.tpsId.localeCompare(b.tpsId));
            for (const [key, lapor] of Object.entries(profile.lapor ?? {})) {
                const lokasi = P.getPrestineLokasi(lapor.idLokasi.substring(0, 10));
                if (!lokasi) continue;
                profileDetails.laporan.push({
                    key,
                    tpsId: lapor.idLokasi,
                    imageId: lapor.imageId,
                    lokasi,
                    reason: lapor.reason,
                    laporTs: lapor.votes.updateTs
                });
            }
            profileDetails.laporan.sort((a, b) => b.laporTs - a.laporTs);
            return of(profileDetails);
        }));
    }

    getFirstName(name: string) {
        const parts = name.split(' ');
        return parts[0];
    }

    getRoleText(role: USER_ROLE) {
        return USER_ROLE[role];
    }
}
