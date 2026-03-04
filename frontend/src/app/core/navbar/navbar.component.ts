import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

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

  get initial() {
    return this.user?.fullName?.charAt(0).toUpperCase() || 'U';
  }
}
