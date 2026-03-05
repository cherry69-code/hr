import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-home.component.html'
})
export class DashboardHomeComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  role = this.authService.getRole();
  stats: any = {};
  loading = true;

  ngOnInit() {
    this.loadStats();
  }

  loadStats() {
    const query = this.role === 'employee' ? `?employeeId=${this.authService.currentUserValue.id}` : '';
    this.http.get(`${environment.apiUrl}/dashboard${query}`).subscribe({
      next: (res: any) => {
        this.stats = res.data;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }
}
