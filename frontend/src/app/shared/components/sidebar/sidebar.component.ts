import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html'
})
export class SidebarComponent {
  authService = inject(AuthService);
  role = this.authService.getRole();

  menuItems = [
    { label: 'Home', icon: 'home', link: '/home', roles: ['employee', 'manager'] },
    { label: 'Dashboard', icon: 'layout-dashboard', link: '/dashboard', roles: ['admin', 'hr', 'employee'] },
    { label: 'Employees', icon: 'users', link: '/employees', roles: ['admin', 'hr'] },
    { label: 'Attendance', icon: 'clock', link: '/attendance', roles: ['admin', 'hr', 'employee'] },
    { label: 'Leaves', icon: 'calendar', link: '/leaves', roles: ['admin', 'hr', 'employee'] },
    { label: 'Payroll', icon: 'banknote', link: '/payroll', roles: ['admin', 'hr', 'employee'] },
    { label: 'Locations', icon: 'map-pin', link: '/locations', roles: ['admin', 'hr'] },
    { label: 'Incentives', icon: 'trending-up', link: '/incentives', roles: ['admin', 'hr', 'employee'] },
    { label: 'Incentive Rules', icon: 'settings', link: '/incentives/rules', roles: ['admin', 'hr'] },
    { label: 'Manage Incentives', icon: 'bar-chart', link: '/incentives/analytics', roles: ['admin', 'hr'] },
    { label: 'Documents', icon: 'file-text', link: '/documents', roles: ['admin', 'hr', 'employee'] },
    { label: 'My Documents', icon: 'file-text', link: '/my-documents', roles: ['admin', 'hr', 'employee', 'manager'] },
    { label: 'HR Documents', icon: 'file-text', link: '/hr-documents', roles: ['admin', 'hr'] },
    { label: 'Offer Letter', icon: 'mail', link: '/offer-letter', roles: ['admin', 'hr'] },
    { label: 'Joining Agreement', icon: 'file-text', link: '/joining-agreement', roles: ['admin', 'hr'] },
    { label: 'Templates', icon: 'settings', link: '/templates', roles: ['admin'] }
  ];

  get filteredMenu() {
    return this.menuItems.filter(item => item.roles.includes(this.role));
  }

  logout() {
    this.authService.logout();
  }
}
