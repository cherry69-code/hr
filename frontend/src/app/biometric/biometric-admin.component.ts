import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-biometric-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './biometric-admin.component.html'
})
export class BiometricAdminComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  loading = false;
  syncing = false;

  status: any = null;
  devices: any[] = [];
  logs: any[] = [];

  filters = {
    employeeCode: '',
    deviceId: '',
    date: '',
    source: ''
  };

  ngOnInit() {
    this.refreshAll();
  }

  refreshAll() {
    this.loadStatus();
    this.loadDevices();
    this.loadLogs();
  }

  loadStatus() {
    this.http.get(`${environment.apiUrl}/biometric/sync/status`).subscribe({
      next: (res: any) => (this.status = res.data),
      error: () => (this.status = null)
    });
  }

  loadDevices() {
    this.http.get(`${environment.apiUrl}/biometric/devices`).subscribe({
      next: (res: any) => (this.devices = res.data || []),
      error: () => (this.devices = [])
    });
  }

  loadLogs() {
    this.loading = true;
    const params: any = { limit: 200 };
    if (this.filters.employeeCode) params.employeeCode = this.filters.employeeCode.trim();
    if (this.filters.deviceId) params.deviceId = this.filters.deviceId.trim();
    if (this.filters.date) params.date = this.filters.date;
    if (this.filters.source) params.source = this.filters.source.trim();

    this.http.get(`${environment.apiUrl}/biometric/logs`, { params }).subscribe({
      next: (res: any) => {
        this.logs = res.data || [];
        this.loading = false;
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to load logs');
        this.loading = false;
      }
    });
  }

  runSyncNow() {
    this.syncing = true;
    this.http.post(`${environment.apiUrl}/biometric/sync/run`, {}).subscribe({
      next: () => {
        this.toast.success('Sync triggered');
        this.syncing = false;
        this.refreshAll();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Sync failed');
        this.syncing = false;
      }
    });
  }
}

