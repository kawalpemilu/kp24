import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-profile-link',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `<a [routerLink]="['/profile', uid]" target="_blank">{{ uid.substring(0, 10) }}</a>`,
})
export class ProfileLinkComponent {
    @Input() uid = '';

    constructor() { }
}
