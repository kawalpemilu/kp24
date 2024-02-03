import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { APPROVAL_STATUS, Votes } from '../../../functions/src/interfaces';

@Component({
    selector: 'app-digitize',
    standalone: true,
    imports: [CommonModule, FormsModule,
        MatIconModule, MatButtonModule, MatProgressSpinnerModule],
    templateUrl: './digitize.component.html',
    styles: ``
})
export class DigitizeComponent implements OnChanges {
    @ViewChild('firstInput') firstInput!: ElementRef;

    @Input() imageId = '';
    @Input() votes!: Votes;
    @Input() review = false;
    @Output() onSubmit = new EventEmitter<Votes>();
    status = APPROVAL_STATUS.NEW;
    APPROVAL_STATUS = APPROVAL_STATUS;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['imageId']) {
            setTimeout(() => this.firstInput.nativeElement.focus(), 100);
        }
        if (changes['votes'] && this.votes) {
            if (!this.votes.pas1 && !this.votes.pas2 && !this.votes.pas3) {
                this.votes = {} as Votes;
            }
        }
    }

    onDigitized() {
        this.votes.status = this.status;
        this.onSubmit.emit(this.votes);
    }
}
