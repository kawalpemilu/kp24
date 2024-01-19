import { MediaMatcher } from '@angular/cdk/layout';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppService } from './app.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { Auth, signOut } from '@angular/fire/auth';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { getChildrenIds } from '../../functions/src/interfaces';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule,
    MatSidenavModule, MatListModule, HttpClientModule],
  template: `
    <div class="container" [class.is-mobile]="isMobile()">
      <mat-toolbar color="primary" class="toolbar">
        <button mat-icon-button (click)="snav.toggle()">
          <mat-icon>menu</mat-icon>
        </button>
        <h1 class="app-name">KawalPemilu 2024</h1>
      </mat-toolbar>

      <mat-sidenav-container class="sidenav-container"
                            [style.marginTop.px]="isMobile() ? 56 : 0">
        <mat-sidenav #snav [mode]="isMobile() ? 'over' : 'side'"
                    [fixedInViewport]="isMobile()" fixedTopGap="56">
          <mat-nav-list>
            @if (auth.currentUser) {
              <a mat-list-item (click)="logout()">Sign Out</a>
            }
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

    .is-mobile .toolbar {
      position: fixed;
      z-index: 2;
    }

    h1.app-name {
      margin-left: 8px;
    }

    .sidenav-container {
      flex: 1;
    }

    .is-mobile .sidenav-container {
      flex: 1 0 auto;
    }
  `
})
export class AppComponent {
  auth: Auth = inject(Auth);

  private _mobileQueryListener: () => void;

  constructor(changeDetectorRef: ChangeDetectorRef, media: MediaMatcher,
    public service: AppService, private http: HttpClient) {
    service.mobileQuery = media.matchMedia('(max-width: 600px)');
    this._mobileQueryListener = () => changeDetectorRef.detectChanges();
    service.mobileQuery.addListener(this._mobileQueryListener);
    this.initializeService();
  }

  async initializeService() {
    this.service.id2name = (await firstValueFrom(
      this.http.get('assets/id2name.json'))) as Record<string, string>;
    this.service.childrenIds = getChildrenIds(this.service.id2name);
  }

  ngOnDestroy(): void {
    this.service.mobileQuery?.removeListener(this._mobileQueryListener);
  }

  isMobile() {
    return this.service.mobileQuery?.matches;
  }

  logout() {
    signOut(this.auth).then(() => {
      console.log('Sign-out successful');
    }).catch((error) => {
      console.error('Signout failed', error);
    });
  }
}
