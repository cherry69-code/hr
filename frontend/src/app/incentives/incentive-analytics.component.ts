import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { IncentiveService } from '../services/incentive.service';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-incentive-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './incentive-analytics.component.html'
})
export class IncentiveAnalyticsComponent implements OnInit {
  private http = inject(HttpClient);
  private incentiveService = inject(IncentiveService);
  private toast = inject(ToastService);
  private authService = inject(AuthService);

  employees: any[] = [];
  incentives: any[] = [];
  currentUser: any = null;
  loading = false;

  form = {
    employeeId: '',
    period: '',
    achievedAmount: 0,
    overrideBonus: 0
  };

  ngOnInit() {
    this.authService.currentUser$.subscribe((user: any) => this.currentUser = user);
    this.loadEmployees();
    this.loadIncentives();
  }

  loadEmployees() {
    this.http.get(`${environment.apiUrl}/employees`).subscribe({
      next: (res: any) => this.employees = res.data || [],
      error: () => this.toast.error('Failed to load employees')
    });
  }

  loadIncentives() {
    this.incentiveService.getIncentives().subscribe({
      next: (res: any) => this.incentives = res.data || [],
      error: () => this.toast.error('Failed to load incentives')
    });
  }

  calculate() {
    if (!this.form.employeeId || !this.form.period || !this.form.achievedAmount) {
      this.toast.error('Please fill all required fields');
      return;
    }

    this.loading = true;
    this.incentiveService.calculate(this.form).subscribe({
      next: () => {
        this.toast.success('Incentive calculated successfully');
        this.loading = false;
        this.loadIncentives();
        this.resetForm();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.error || 'Calculation failed');
      }
    });
  }

  approve(id: string) {
    if (!confirm('Are you sure you want to approve this incentive?')) return;

    this.incentiveService.approveIncentive(id).subscribe({
      next: () => {
        this.toast.success('Incentive approved');
        this.loadIncentives();
      },
      error: (err) => this.toast.error(err.error?.error || 'Approval failed')
    });
  }

  resetForm() {
    this.form = {
      employeeId: '',
      period: '',
      achievedAmount: 0,
      overrideBonus: 0
    };
  }
}
