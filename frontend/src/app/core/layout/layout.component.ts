import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { NavbarComponent } from '../navbar/navbar.component';
import { ToastComponent } from '../../shared/components/toast/toast.component';
import { Router, NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, NavbarComponent, ToastComponent],
  template: `
    <div class="flex h-screen bg-[#F1F5F9]">
      <!-- Desktop Sidebar -->
      <div class="hidden md:block">
        <app-sidebar></app-sidebar>
      </div>

      <!-- Mobile Sidebar Overlay -->
      <div *ngIf="isMobileMenuOpen"
           class="fixed inset-0 z-40 md:hidden bg-black bg-opacity-50"
           (click)="toggleMobileMenu()">
        <div class="w-64 h-full" (click)="$event.stopPropagation()">
          <app-sidebar class="h-full"></app-sidebar>
        </div>
      </div>

      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Mobile Header (Hidden on Desktop) -->
        <header class="md:hidden bg-[#0F172A] text-white p-4 flex justify-between items-center">
          <span class="font-bold">PropNinja HR</span>
          <button (click)="toggleMobileMenu()" class="p-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
        </header>

        <!-- Navbar (Desktop) -->
        <app-navbar class="hidden md:block"></app-navbar>

        <!-- Main Content -->
        <main class="flex-1 overflow-y-auto p-4 md:p-6">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
    <app-toast></app-toast>
  `
})
export class LayoutComponent {
  isMobileMenuOpen = false;
  private router = inject(Router);

  constructor() {
    this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationEnd) {
        this.isMobileMenuOpen = false;
      }
    });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }
}
