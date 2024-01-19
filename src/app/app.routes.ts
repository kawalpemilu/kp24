import { Routes } from '@angular/router';
import { HierarchyComponent } from './hierarchy/hierarchy.component';

export const routes: Routes = [
    { path: 'h/:id', component: HierarchyComponent },
    { path: '**', component: HierarchyComponent },
];
