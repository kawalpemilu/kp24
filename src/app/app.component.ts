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
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
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
