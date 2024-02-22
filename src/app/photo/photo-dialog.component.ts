import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';

export interface PhotoDialogData {
  photo: string;
}

@Component({
  selector: 'app-photo-dialog',
  templateUrl: './photo-dialog.component.html',
  styleUrl: './photo-dialog.component.css',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
})
export class PhotoDialog {
  constructor(@Inject(MAT_DIALOG_DATA) public data: PhotoDialogData) {}

  rotation: number = 0;

  rotateLeft() {
    this.rotation = (this.rotation - 90) % 360;
  }

  rotateRight() {
    this.rotation = (this.rotation + 90) % 360;
  }
}
