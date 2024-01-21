import { MediaMatcher } from '@angular/cdk/layout';
import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppService, StaticHierarchy } from './app.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { getChildrenIds } from '../../functions/src/interfaces';
import { map, shareReplay } from 'rxjs';

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
            <a mat-list-item (click)="router.navigate(['/h', '']); snav.close()">Home</a>
            @if (service.auth.currentUser; as u) {
              <a mat-list-item (click)="router.navigate(['/u', u.uid]); snav.close()">My Profile</a>
              <a mat-list-item (click)="service.logout()">Sign Out</a>
            } @else {
              <a mat-list-item (click)="service.login()">Sign In</a>
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
  constructor(
    changeDetectorRef: ChangeDetectorRef,
    media: MediaMatcher,
    public router: Router,
    public service: AppService,
    private http: HttpClient) {

    service.changeDetectorRef = changeDetectorRef;
    service.mobileQuery = media.matchMedia('(max-width: 600px)');
    service.mobileQuery.addListener(() => changeDetectorRef.detectChanges());
    service.hierarchy$ =
      this.http.get('assets/id2name.json').pipe(
        map((json): StaticHierarchy => {
          const id2name = json as Record<string, string>;
          return {
            id2name: id2name,
            childrenIds: getChildrenIds(id2name)
          }
        }), shareReplay(1)
      );
  }

  isMobile() {
    return this.service.mobileQuery?.matches;
  }
}
