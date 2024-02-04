import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule,
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
            <a mat-list-item (click)="router.navigate(['/h', '']); snav.close()">Beranda</a>
            <a mat-list-item (click)="router.navigate(['/s']); snav.close()">Cari Lokasi TPS</a>
            @if (service.auth.currentUser; as u) {
              <a mat-list-item (click)="router.navigate(['/u']); snav.close()">Profil</a>
              @if (service.profile$ | async; as p) {
                @if (p.role >= USER_ROLE.ADMIN) {
                  <a mat-list-item (click)="router.navigate(['/m']); snav.close()">User Management</a>
                }
              }
              <hr>
              <a mat-list-item (click)="service.logout()">Keluar</a>
            } @else {
              <a mat-list-item (click)="service.login()">Masuk</a>
            }
            <a mat-list-item (click)="router.navigate(['/a']); snav.close()">Tentang Kami</a>
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content>
          <router-outlet></router-outlet>
        </mat-sidenav-content>
      </mat-sidenav-container>

      <mat-toolbar color="primary" class="toolbar">
        <a mat-button routerLink="/h" routerLinkActive="active" ariaCurrentWhenActive="page">
          <mat-icon>home</mat-icon>
          <span>Beranda</span>
        </a>
        <a mat-button routerLink="/s" routerLinkActive="active" ariaCurrentWhenActive="page">
          <mat-icon>search</mat-icon>
          <span>Cari TPS</span>
        </a>
        @if (service.auth.currentUser; as u) {
          <a mat-button routerLink="/u" routerLinkActive="active" ariaCurrentWhenActive="page">
            <mat-icon>person</mat-icon>
            <span>Profil</span>
          </a>
          @if (service.profile$ | async; as p) {
            @if (p.role >= USER_ROLE.ADMIN) {
              <a mat-button routerLink="/m" routerLinkActive="active" ariaCurrentWhenActive="page">
                <mat-icon>manage_accounts</mat-icon>
                <span>User Management</span>
              </a>
            }
          }
        } @else {
          <a mat-button (click)="service.login()">
            <mat-icon>login</mat-icon>
            <span>Masuk</span>
          </a>
        }
      </mat-toolbar>
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

    .mat-mdc-button {
      flex: 1 1 auto;
    }

    .mat-mdc-button.active {
      color: #ff4081;
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
