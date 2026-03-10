import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { AttendanceService } from '../services/attendance.service';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-attendance-adjustment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance-adjustment.component.html'
})
export class AttendanceAdjustmentComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private attendanceService = inject(AttendanceService);
  private toast = inject(ToastService);

  currentUser = this.authService.currentUserValue;
  employees: any[] = [];
  requests: any[] = [];

  // Form Data
  form = {
    employeeId: '',
    date: '',
    newStatus: 'Present',
    reason: ''
  };

  loading = false;
  fieldLogDate = new Date().toISOString().slice(0, 10);
  fieldLogs: any[] = [];

  get isAdmin() {
    return this.currentUser?.role === 'admin';
  }

  ngOnInit() {
    this.loadEmployees();
    this.loadRequests();
    this.loadFieldLogs();
  }

  loadEmployees() {
    this.http.get(`${environment.apiUrl}/employees`).subscribe({
      next: (res: any) => this.employees = res.data || [],
      error: () => this.toast.error('Failed to load employees')
    });
  }

  loadRequests() {
    this.attendanceService.getCorrectionRequests().subscribe({
      next: (res: any) => this.requests = res.data || [],
      error: () => this.toast.error('Failed to load correction requests')
    });
  }

  loadFieldLogs() {
    this.http.get(`${environment.apiUrl}/field-attendance/logs?date=${this.fieldLogDate}`).subscribe({
      next: (res: any) => this.fieldLogs = res.data || [],
      error: () => {}
    });
  }

  submitRequest() {
    if (!this.form.employeeId || !this.form.date || !this.form.reason) {
      this.toast.error('Please fill all required fields');
      return;
    }

    this.loading = true;
    this.attendanceService.requestCorrection(this.form).subscribe({
      next: () => {
        this.toast.success(this.isAdmin ? 'Attendance updated successfully' : 'Request submitted for approval');
        this.loading = false;
        this.resetForm();
        this.loadRequests();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.error || 'Failed to submit request');
      }
    });
  }

  approve(req: any) {
    if (!confirm('Approve this attendance correction?')) return;
    this.updateStatus(req._id, 'Approved');
  }

  reject(req: any) {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return;
    this.updateStatus(req._id, 'Rejected', reason);
  }

  updateStatus(id: string, status: string, comment?: string) {
    this.attendanceService.updateCorrectionStatus(id, { status, adminComment: comment || '' }).subscribe({
      next: () => {
        this.toast.success(`Request ${status}`);
        this.loadRequests();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to update status')
    });
  }

  resetForm() {
    this.form = {
      employeeId: '',
      date: '',
      newStatus: 'Present',
      reason: ''
    };
  }
}
