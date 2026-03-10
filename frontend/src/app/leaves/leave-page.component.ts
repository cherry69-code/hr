import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-leave-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leave-page.component.html'
})
export class LeavePageComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  role = this.authService.getRole();
  level = this.authService.currentUserValue?.level;

  get isAdmin() {
    return this.role === 'admin';
  }

  get isManager() {
    return this.role === 'hr' || this.role === 'manager' ||
           ['N1', 'N2', 'N3', 'PnL'].includes(this.level);
  }

  leaves: any[] = [];
  loading = false;

  leaveForm = {
    leaveType: 'Sick Leave',
    fromDate: '',
    toDate: '',
    reason: ''
  };

  ngOnInit() {
    this.loadLeaves();
  }

  loadLeaves() {
    // If manager, we might want to separate "My Leaves" and "Team Leaves"
    // But for now, let's load all accessible leaves.
    // The backend now returns:
    // - Employee: Own leaves
    // - Manager: Own + Reportees
    // - Admin: All

    // We can filter in frontend or backend.
    // Let's rely on backend to return everything we have access to,
    // and then frontend can categorize.

    this.http.get(`${environment.apiUrl}/leaves`).subscribe({
      next: (res: any) => this.leaves = res.data,
      error: (err) => this.toast.error(err.error?.error || 'Failed to load leaves')
    });
  }

  get myLeaves() {
    if (this.isAdmin) return [];
    return this.leaves.filter(l => l.employeeId._id === this.authService.currentUserValue.id);
  }

  get teamLeaves() {
    if (this.isAdmin) return [];
    return this.leaves.filter(l => l.employeeId._id !== this.authService.currentUserValue.id);
  }

  get approvalLeaves() {
    return this.leaves;
  }

  applyLeave() {
    const payload = {
      ...this.leaveForm,
      employeeId: this.authService.currentUserValue.id,
      status: 'pending'
    };
    this.http.post(`${environment.apiUrl}/leaves`, payload).subscribe({
      next: () => {
        this.toast.success('Leave applied successfully');
        this.loadLeaves();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to apply for leave')
    });
  }

  updateStatus(leaveId: string, status: string) {
    this.http.put(`${environment.apiUrl}/leaves/${leaveId}`, { status }).subscribe({
      next: () => {
        this.toast.success(`Leave ${status} successfully`);
        this.loadLeaves();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to update leave status')
    });
  }
}
