import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

const BUILD_ID = '2026-08-07-1240';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html'
})
export class NavbarComponent {
  private authService = inject(AuthService);
  user = this.authService.currentUserValue;
  role = this.authService.getRole();
  buildId = BUILD_ID;

  get initial() {
    return this.user?.fullName?.charAt(0).toUpperCase() || 'U';
  }
}
