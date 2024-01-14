import { Routes } from '@angular/router';
import { HierarchyComponent } from './hierarchy/hierarchy.component';
import { UploadComponent } from './upload/upload.component';

export const routes: Routes = [
    { path: 'h/:id', component: HierarchyComponent },
    { path: 'u/:id', component: UploadComponent },
    { path: '**', component: HierarchyComponent },
];
