import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppService } from './app.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { USER_ROLE, Hierarchy, PrestineLokasi } from '../../functions/src/interfaces';
import { map, shareReplay } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule,
    MatSidenavModule, MatListModule, HttpClientModule],
  template: `
    <div class="container">
      <mat-toolbar color="primary" class="toolbar">
        <button mat-icon-button (click)="snav.toggle()">
          <mat-icon>menu</mat-icon>
        </button>
        <h1 class="app-name" style="cursor: pointer;" (click)="router.navigate(['/h', '']); snav.close()">
          KawalPemilu 2024
        </h1>
        <span class="spacer"></span>
        <button mat-icon-button (click)="router.navigate(['/s']); snav.close()">
          <mat-icon>search</mat-icon>
        </button>
      </mat-toolbar>

      <mat-sidenav-container class="sidenav-container">
        <mat-sidenav #snav mode="over">
          <mat-nav-list>
            <a mat-list-item (click)="router.navigate(['/h', '']); snav.close()">Home</a>
            <a mat-list-item (click)="router.navigate(['/s']); snav.close()">Cari TPS</a>
            @if (service.auth.currentUser; as u) {
              <a mat-list-item (click)="router.navigate(['/u']); snav.close()">My Profile</a>
              @if (service.profile$ | async; as p) {
                @if (p.role >= USER_ROLE.ADMIN) {
                  <a mat-list-item (click)="router.navigate(['/m']); snav.close()">User Management</a>
                }
              }
              <hr>
              <a mat-list-item (click)="service.logout()">Sign Out</a>
            } @else {
              <a mat-list-item (click)="service.login()">Sign In</a>
            }
            <a mat-list-item (click)="router.navigate(['/a']); snav.close()">About KP24</a>
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content>
          <router-outlet></router-outlet>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: `
    .container {
      display: flex;
      flex-direction: column;
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
    }

    h1.app-name {
      margin-left: 8px;
    }

    .sidenav-container {
      flex: 1;
    }
    .spacer {
      flex: 1 1 auto;
    }
  `
})
export class AppComponent {
  USER_ROLE = USER_ROLE;

  constructor(
    public router: Router,
    public service: AppService,
    private http: HttpClient) {

    service.lokasi$ =
      this.http.get('assets/tps.json?v=2').pipe(
        map(json => new PrestineLokasi(json as Hierarchy)),
        shareReplay(1)
      );
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.service.viewportWidth = window.innerWidth;
  }
}
