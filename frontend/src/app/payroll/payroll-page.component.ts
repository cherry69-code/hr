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
      next: (res: any) => this.employees = res.data,
      error: (err) => this.toast.error(err.error?.error || 'Failed to load employees')
    });
  }

  loadMyPayslips() {
    const userId = this.authService.currentUserValue.id;
    this.http.get(`http://localhost:5000/api/payroll/payslips/${userId}`).subscribe({
      next: (res: any) => {
        this.payslips = res.data;
      },
      error: (err) => {
        this.payslips = [];
        this.toast.error(err.error?.error || 'Failed to load payslips');
      }
    });
  }

  generatePayslip(userId: string) {
    this.loading = true;
    const payload = { employeeId: userId, month: this.selectedMonth, year: this.selectedYear };
    this.http.post(`http://localhost:5000/api/payroll/generate`, payload).subscribe({
      next: (res: any) => {
        this.toast.success(`Payslip generated successfully. Net Pay: ₹${res.data.netSalary}`);
        this.loading = false;

        // If employee, reload list. If admin, maybe open PDF?
        if (res.data.pdfUrl) {
          window.open(res.data.pdfUrl, '_blank');
        }

        if (this.role === 'employee') {
          this.loadMyPayslips();
        }
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to generate payslip');
        this.loading = false;
      }
    });
  }
}
