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
          <img src="assets/logo-putih.png" width="51px" height="32px" style="vertical-align: middle; height: 32px; margin-right: 8px;">
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
            <a mat-list-item (click)="router.navigate(['/h', '']); snav.close()">
              <mat-icon>home</mat-icon>
              Beranda
            </a>
            <a mat-list-item (click)="router.navigate(['/s']); snav.close()">
              <mat-icon>search</mat-icon>
              Cari Lokasi TPS
            </a>
            @if (service.auth.currentUser; as u) {
              <a mat-list-item (click)="router.navigate(['/u']); snav.close()">
                <mat-icon>person</mat-icon>
                Profil Saya
              </a>
              @if (service.profile$ | async; as p) {
                @if (p.role >= USER_ROLE.ADMIN) {
                  <a mat-list-item (click)="router.navigate(['/m']); snav.close()">
                    <mat-icon>manage_accounts</mat-icon>
                    User Management
                  </a>
                }
              }
              <hr>
              <a mat-list-item (click)="service.logout()">
                <mat-icon>logout</mat-icon>
                Keluar
              </a>
            } @else {
              <a mat-list-item (click)="service.login()">
                <mat-icon>login</mat-icon>
                Masuk
              </a>
            }
            <a mat-list-item (click)="router.navigate(['/about']); snav.close()">
              <mat-icon>info</mat-icon>
              Tentang Kami
            </a>
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content>
          <router-outlet></router-outlet>
        </mat-sidenav-content>
      </mat-sidenav-container>

      <!-- TODO: Remove this card once we conclude the testing phase. -->
      <div class="banner">
          Masa uji coba berlaku hingga <strong>12 Februari 2024</strong>.
          Setelah itu semua data & foto akan dihapus untuk penghitungan yang sebenarnya.
      </div>

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

    .sidenav-container .mat-icon {
      vertical-align: middle;
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

    .banner {
      background-color: #FF6F00;
      color: white;
      padding: 0.5rem 1rem;
      text-align: center;
      font-size: 0.6rem;
      line-height: 0.9rem;
    }

    @media (min-width: 600px) {
      .banner {
        font-size: 0.85rem;
        padding: 0.75rem 2rem;
        line-height: 1rem;
      }
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
