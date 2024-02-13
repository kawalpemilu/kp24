import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-about',
    standalone: true,
    imports: [CommonModule, MatExpansionModule, RouterLink],
    templateUrl: './about.component.html',
    styleUrl: './about.component.css'
})
export class AboutComponent {
}
