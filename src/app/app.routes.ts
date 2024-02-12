import { Routes } from '@angular/router';
import { HierarchyComponent } from './hierarchy/hierarchy.component';
import { UserProfileComponent } from './user/profile.component';
import { UserManagementComponent } from './user/management.component';
import { SearchComponent } from './search/search.component';
import { AboutComponent } from './about/about.component';
import { LeaderboardComponent } from './leaderboard/leaderboard.component';

export const routes: Routes = [
    { path: 'profile', component: UserProfileComponent },
    { path: 'profile/:uid', component: UserProfileComponent },
    { path: 'manage', component: UserManagementComponent },
    { path: 'h/:id', component: HierarchyComponent },
    { path: 'search', component: SearchComponent },
    { path: 'leaderboard', component: LeaderboardComponent },
    { path: 'about', component: AboutComponent },
    { path: '**', component: HierarchyComponent },
];
