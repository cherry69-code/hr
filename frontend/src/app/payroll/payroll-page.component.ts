import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-payroll-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payroll-page.component.html'
})
export class PayrollPageComponent implements OnInit {
  public http = inject(HttpClient);
  public authService = inject(AuthService);
  private toast = inject(ToastService);

  role = this.authService.getRole();
  employees: any[] = [];
  payslips: any[] = [];
  payslipsByEmployeeId: Record<string, any> = {};
  loading = false;

  // Month selection
  months = [
    { name: 'January', value: 1 }, { name: 'February', value: 2 }, { name: 'March', value: 3 },
    { name: 'April', value: 4 }, { name: 'May', value: 5 }, { name: 'June', value: 6 },
    { name: 'July', value: 7 }, { name: 'August', value: 8 }, { name: 'September', value: 9 },
    { name: 'October', value: 10 }, { name: 'November', value: 11 }, { name: 'December', value: 12 }
  ];

  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();

  ngOnInit() {
    if (this.role !== 'employee') {
      this.loadEmployees();
    } else {
      this.loadMyPayslips();
    }
  }

  loadEmployees() {
    this.http.get(`${environment.apiUrl}/employees`).subscribe({
      next: (res: any) => {
        this.employees = res.data || [];
        this.loadPayslipsForMonth();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to load employees')
    });
  }

  loadPayslipsForMonth() {
    if (this.role === 'employee') return;
    this.http.get(`${environment.apiUrl}/payroll/payslips?month=${this.selectedMonth}&year=${this.selectedYear}`).subscribe({
      next: (res: any) => {
        const rows = res.data || [];
        const map: Record<string, any> = {};
        for (const r of rows) {
          const empId = r.employeeId?._id || r.employeeId;
          if (empId) map[String(empId)] = r;
        }
        this.payslipsByEmployeeId = map;
      },
      error: () => {
        this.payslipsByEmployeeId = {};
      }
    });
  }

  loadMyPayslips() {
    const userId = this.authService.currentUserValue.id;
    this.http.get(`${environment.apiUrl}/payroll/payslips/${userId}`).subscribe({
      next: (res: any) => {
        this.payslips = res.data;
      },
      error: (err) => {
        this.payslips = [];
        this.toast.error(err.error?.error || 'Failed to load payslips');
      }
    });
  }

  generateAllPayslips() {
    this.loading = true;
    const payload = { month: this.selectedMonth, year: this.selectedYear };
    this.http.post(`${environment.apiUrl}/payroll/generate-all`, payload).subscribe({
      next: (res: any) => {
        const ok = Number(res?.data?.ok || 0);
        const total = Number(res?.data?.total || 0);
        this.toast.success(`Payroll generated: ${ok}/${total}`);
        this.loading = false;
        this.loadPayslipsForMonth();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to generate payroll');
        this.loading = false;
      }
    });
  }

  downloadPayslip(payslipId: string) {
    const id = String(payslipId || '').trim();
    if (!id) return;
    this.http.get(`${environment.apiUrl}/payroll/payslip/${id}/download-url`).subscribe({
      next: (res: any) => {
        const url = String(res?.url || '');
        if (url) window.open(url, '_blank');
        else this.toast.error('Download not available');
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to download payslip');
      }
    });
  }
}
