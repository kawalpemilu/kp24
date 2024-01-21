import { Routes } from '@angular/router';
import { HierarchyComponent } from './hierarchy/hierarchy.component';
import { UserProfileComponent } from './user/profile.component';
import { UserManagementComponent } from './user/management.component';

export const routes: Routes = [
    { path: 'u', component: UserProfileComponent },
    { path: 'm', component: UserManagementComponent },
    { path: 'h/:id', component: HierarchyComponent },
    { path: '**', component: HierarchyComponent },
];
