import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ChildLokasi, LokasiData } from './hierarchy.component';
import { AppService } from '../app.service';
import { UserProfile } from '../../../functions/src/interfaces';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Router } from '@angular/router';
import { TpsRowComponent } from './tps-row.component';

@Component({
  selector: 'app-tps-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, TpsRowComponent,
    MatInputModule, MatFormFieldModule, FormsModule, MatCheckboxModule],
  templateUrl: './tps-list.component.html',
  styleUrl: './tps-list.component.css'
})
export class TpsListComponent implements OnChanges {
  @Input() tpsNo = '';
  @Input({ required: true }) userProfile: UserProfile | null = null;
  @Input({ required: true }) lokasi!: LokasiData;

  tpsList: ChildLokasi[] = [];

  constructor(public service: AppService, private router: Router) { }

  changeTpsNo(event: any) {
    const tpsNo = +(`${event.target.value}`.substring(0, 3));
    this.router.navigate(['/h', this.lokasi.id +
      ((isNaN(tpsNo) || !tpsNo) ? '' : tpsNo)]);
  }

  ngOnChanges() {
    this.updateTpsList();
  }

  updateTpsList() {
    if (!this.tpsNo && !this.service.isPendingTps &&
      !this.service.isErrorTps &&
      !this.service.isCompleteTps) {
      this.tpsList = this.lokasi.children;
      return;
    }

    this.tpsList = this.lokasi.children.filter(c => {
      const a = c.agg[0];
      if (this.tpsNo && +c.id === +this.tpsNo) return true;
      if (this.service.isPendingTps && a.totalPendingTps) return true;
      if (this.service.isErrorTps && a.totalErrorTps) return true;
      if (this.service.isCompleteTps && a.totalCompletedTps) return true;
      return false;
    });
  }

  getKpuLink(tpsId: string) {
    const idDesa = tpsId.substring(0, 10);
    const tpsNo = tpsId.substring(10).padStart(3, '0');
    return `https://pemilu2024.kpu.go.id/pilpres/hitung-suara/${
        idDesa.substring(0, 2)}/${
        idDesa.substring(0, 4)}/${
        idDesa.substring(0, 6)}/${
        idDesa}/${idDesa + tpsNo}`;
  }
}
