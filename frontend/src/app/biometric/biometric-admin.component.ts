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
  savingConfig = false;
  testingConfig = false;
  savingMapping = false;
  loadingMappings = false;
  loadingIssues = false;
  retryingIssueId = '';

  status: any = null;
  report: any = null;
  config: any = null;
  devices: any[] = [];
  logs: any[] = [];
  issues: any[] = [];
  mappings: any[] = [];
  unmappedIds: any[] = [];
  employees: any[] = [];

  configForm = {
    enabled: false,
    host: '',
    dbName: '',
    dbUser: '',
    dbPassword: '',
    startFrom: '',
    intervalMinutes: 5,
    timezone: 'Asia/Kolkata'
  };

  mappingForm = {
    etimeUserId: '',
    employeeId: '',
    notes: ''
  };

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
    this.loadReport();
    this.loadConfig();
    this.loadDevices();
    this.loadEmployees();
    this.loadMappings();
    this.loadIssues();
    this.loadLogs();
  }

  loadStatus() {
    this.http.get(`${environment.apiUrl}/biometric/sync/status`).subscribe({
      next: (res: any) => (this.status = res.data),
      error: () => (this.status = null)
    });
  }

  loadReport() {
    this.http.get(`${environment.apiUrl}/biometric/sync/report`).subscribe({
      next: (res: any) => (this.report = res.data || null),
      error: () => (this.report = null)
    });
  }

  loadConfig() {
    this.http.get(`${environment.apiUrl}/biometric/etime-config`).subscribe({
      next: (res: any) => {
        this.config = res.data || null;
        this.configForm = {
          enabled: Boolean(this.config?.enabled),
          host: this.config?.host || '',
          dbName: this.config?.database || '',
          dbUser: this.config?.user || '',
          dbPassword: '',
          startFrom: this.config?.startFrom ? new Date(this.config.startFrom).toISOString().slice(0, 16) : '',
          intervalMinutes: Math.max(1, Math.round(Number(this.config?.intervalMs || 300000) / 60000)),
          timezone: this.config?.timezone || 'Asia/Kolkata'
        };
      },
      error: () => {
        this.config = null;
      }
    });
  }

  loadDevices() {
    this.http.get(`${environment.apiUrl}/biometric/devices`).subscribe({
      next: (res: any) => (this.devices = res.data || []),
      error: () => (this.devices = [])
    });
  }

  loadEmployees() {
    this.http.get(`${environment.apiUrl}/employees`, { params: { limit: 200 } }).subscribe({
      next: (res: any) => {
        this.employees = (res.data || []).filter((e: any) => String(e.role || '') !== 'admin');
      },
      error: () => {
        this.employees = [];
      }
    });
  }

  loadMappings() {
    this.loadingMappings = true;
    this.http.get(`${environment.apiUrl}/biometric/mappings`).subscribe({
      next: (res: any) => {
        this.mappings = res.data?.mappings || [];
        this.unmappedIds = res.data?.unmappedIds || [];
        this.loadingMappings = false;
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to load mappings');
        this.loadingMappings = false;
      }
    });
  }

  loadIssues() {
    this.loadingIssues = true;
    this.http.get(`${environment.apiUrl}/biometric/sync/issues`, { params: { limit: 100 } }).subscribe({
      next: (res: any) => {
        this.issues = res.data || [];
        this.loadingIssues = false;
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to load sync issues');
        this.loadingIssues = false;
      }
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

  saveConfig() {
    this.savingConfig = true;
    const payload: any = {
      enabled: this.configForm.enabled,
      host: this.configForm.host.trim(),
      dbName: this.configForm.dbName.trim(),
      dbUser: this.configForm.dbUser.trim(),
      startFrom: this.configForm.startFrom ? new Date(this.configForm.startFrom).toISOString() : '',
      intervalMs: Math.max(1, Number(this.configForm.intervalMinutes || 5)) * 60000,
      timezone: (this.configForm.timezone || 'Asia/Kolkata').trim()
    };
    if (this.configForm.dbPassword.trim()) {
      payload.dbPassword = this.configForm.dbPassword;
    }

    this.http.put(`${environment.apiUrl}/biometric/etime-config`, payload).subscribe({
      next: (res: any) => {
        this.config = res.data || null;
        this.toast.success('Biometric config saved');
        this.savingConfig = false;
        this.configForm.dbPassword = '';
        this.loadConfig();
        this.loadReport();
        this.loadStatus();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to save biometric config');
        this.savingConfig = false;
      }
    });
  }

  testConfig() {
    this.testingConfig = true;
    this.http.post(`${environment.apiUrl}/biometric/etime-config/test`, {
      host: this.configForm.host.trim(),
      dbName: this.configForm.dbName.trim(),
      dbUser: this.configForm.dbUser.trim(),
      dbPassword: this.configForm.dbPassword.trim(),
      timezone: (this.configForm.timezone || 'Asia/Kolkata').trim()
    }).subscribe({
      next: (res: any) => {
        const rows = Number(res?.data?.rows || 0);
        this.toast.success(`Connection OK. DeviceLogs rows checked: ${rows}`);
        this.testingConfig = false;
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Connection test failed');
        this.testingConfig = false;
      }
    });
  }

  useUnmappedId(etimeUserId: string) {
    this.mappingForm.etimeUserId = String(etimeUserId || '').trim();
  }

  saveMapping() {
    const etimeUserId = this.mappingForm.etimeUserId.trim();
    const employeeId = this.mappingForm.employeeId.trim();
    if (!etimeUserId || !employeeId) {
      this.toast.error('Please select both eSSL UserId and HRMS employee');
      return;
    }

    this.savingMapping = true;
    this.http.post(`${environment.apiUrl}/biometric/mappings`, {
      etimeUserId,
      employeeId,
      notes: this.mappingForm.notes.trim()
    }).subscribe({
      next: () => {
        this.toast.success('Employee mapping saved');
        this.savingMapping = false;
        this.mappingForm = { etimeUserId: '', employeeId: '', notes: '' };
        this.loadMappings();
        this.loadIssues();
        this.loadReport();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to save mapping');
        this.savingMapping = false;
      }
    });
  }

  deleteMapping(mappingId: string) {
    const id = String(mappingId || '').trim();
    if (!id) return;
    if (!confirm('Delete this mapping?')) return;
    this.http.delete(`${environment.apiUrl}/biometric/mappings/${id}`).subscribe({
      next: () => {
        this.toast.success('Mapping deleted');
        this.loadMappings();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to delete mapping')
    });
  }

  runSyncNow() {
    this.syncing = true;
    this.http.post(`${environment.apiUrl}/biometric/sync/run`, {}).subscribe({
      next: (res: any) => {
        const count = Number(res?.data?.upserted || 0);
        this.toast.success(`Sync completed. New rows: ${count}`);
        this.syncing = false;
        this.refreshAll();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Sync failed');
        this.syncing = false;
        this.loadIssues();
        this.loadReport();
        this.loadStatus();
      }
    });
  }

  retryIssue(issueId: string) {
    const id = String(issueId || '').trim();
    if (!id) return;
    this.retryingIssueId = id;
    this.http.post(`${environment.apiUrl}/biometric/sync/issues/${id}/retry`, {}).subscribe({
      next: () => {
        this.toast.success('Retry completed');
        this.retryingIssueId = '';
        this.refreshAll();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Retry failed');
        this.retryingIssueId = '';
      }
    });
  }

  employeeLabel(employee: any): string {
    const name = String(employee?.fullName || 'Unknown');
    const code = String(employee?.employeeId || '');
    return code ? `${name} (${code})` : name;
  }
}
