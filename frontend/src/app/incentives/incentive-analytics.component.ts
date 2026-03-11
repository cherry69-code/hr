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
  revenues: any[] = [];
  currentUser: any = null;
  loading = false;

  calcForm = {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  };

  payoutForm = {
    year: new Date().getFullYear(),
    quarter: 1
  };

  revenueForm: any = {
    employeeId: '',
    clientName: '',
    projectName: '',
    revenueAmount: 0,
    invoiceRaised: true,
    paymentCollected: true,
    bookingDate: new Date().toISOString().slice(0, 10),
    invoiceUrl: ''
  };

  // Bulk Calculation
  bulkPeriod = '';
  bulkData: any[] = [];
  showBulkMode = false;

  ngOnInit() {
    this.authService.currentUser$.subscribe((user: any) => this.currentUser = user);
    this.loadEmployees();
    this.loadCalculations();
    this.loadRevenue();
  }

  loadEmployees() {
    this.http.get(`${environment.apiUrl}/employees`).subscribe({
      next: (res: any) => {
        this.employees = res.data || [];
        this.initBulkData();
      },
      error: () => this.toast.error('Failed to load employees')
    });
  }

  initBulkData() {
    // Filter out Admins if necessary, keep Sales/Employees
    this.bulkData = this.employees
      .filter(e => e.role !== 'admin')
      .map(e => ({
        employeeId: e._id,
        name: e.fullName,
        role: e.level || e.role,
        achievedAmount: 0,
        overrideBonus: 0,
        status: 'Pending' // UI status
      }));
  }

  toggleBulkMode() {
    this.showBulkMode = !this.showBulkMode;
    if (this.showBulkMode && !this.bulkPeriod) {
        // Set default period to current month/quarter?
        const date = new Date();
        this.bulkPeriod = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
    }
  }

  async calculateBulk() {
    this.toast.error('Bulk calculation is replaced by Monthly Calculation.');
  }


  loadCalculations() {
    this.incentiveService.getCalculations({ month: this.calcForm.month, year: this.calcForm.year }).subscribe({
      next: (res: any) => this.incentives = res.data || [],
      error: () => this.toast.error('Failed to load incentives')
    });
  }

  calculate() {
    this.loading = true;
    this.incentiveService.calculateMonthly(this.calcForm.month, this.calcForm.year).subscribe({
      next: () => {
        this.toast.success('Monthly incentive calculated');
        this.loading = false;
        this.loadCalculations();
        this.loadRevenue();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.error || 'Calculation failed');
      }
    });
  }

  approve(id: string) {
    if (!confirm('Are you sure you want to approve this incentive?')) return;

    this.incentiveService.approveCalculation(id).subscribe({
      next: () => {
        this.toast.success('Incentive approved');
        this.loadCalculations();
      },
      error: (err) => this.toast.error(err.error?.error || 'Approval failed')
    });
  }

  reject(id: string) {
    const reason = prompt('Reject reason (optional)') || '';
    if (!confirm('Are you sure you want to reject this incentive?')) return;

    this.incentiveService.rejectCalculation(id, reason).subscribe({
      next: () => {
        this.toast.success('Incentive rejected');
        this.loadCalculations();
      },
      error: (err) => this.toast.error(err.error?.error || 'Rejection failed')
    });
  }

  loadRevenue() {
    this.incentiveService.getRevenue({ month: this.calcForm.month, year: this.calcForm.year }).subscribe({
      next: (res: any) => this.revenues = res.data || [],
      error: () => this.revenues = []
    });
  }

  addRevenue() {
    if (!this.revenueForm.employeeId || !this.revenueForm.clientName || !this.revenueForm.projectName || !this.revenueForm.bookingDate) {
      this.toast.error('Please fill revenue fields');
      return;
    }
    this.loading = true;
    this.incentiveService.createRevenue(this.revenueForm).subscribe({
      next: () => {
        this.loading = false;
        this.toast.success('Revenue added');
        this.loadRevenue();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.error || 'Failed to add revenue');
      }
    });
  }

  deleteRevenue(id: string) {
    if (!confirm('Delete revenue entry?')) return;
    this.incentiveService.deleteRevenue(id).subscribe({
      next: () => {
        this.toast.success('Deleted');
        this.loadRevenue();
      },
      error: (err) => this.toast.error(err.error?.error || 'Delete failed')
    });
  }

  payQuarterNow() {
    this.loading = true;
    this.incentiveService.payQuarter(this.payoutForm.year, this.payoutForm.quarter).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.toast.success(`Paid: ${res.data?.modified || 0}`);
        this.loadCalculations();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.error || 'Payout failed');
      }
    });
  }
}
