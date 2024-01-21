import { Routes } from '@angular/router';
import { HierarchyComponent } from './hierarchy/hierarchy.component';
import { UserProfileComponent } from './user/profile.component';

export const routes: Routes = [
    { path: 'u/:id', component: UserProfileComponent },
    { path: 'h/:id', component: HierarchyComponent },
    { path: '**', component: HierarchyComponent },
];
