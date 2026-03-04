import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { LocationsPageComponent } from '../locations/locations-page.component';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-attendance-page',
  standalone: true,
  imports: [CommonModule, LocationsPageComponent],
  templateUrl: './attendance-page.component.html'
})
export class AttendancePageComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  role = this.authService.getRole();
  attendanceRecords: any[] = [];
  loading = false;
  statusMessage = '';

  get isAdmin() {
    return this.role === 'admin';
  }

  ngOnInit() {
    if (!this.isAdmin) {
      this.loadAttendance();
    }
  }

  loadAttendance() {
    const userId = this.authService.currentUserValue.id;
    this.http.get(`http://localhost:5000/api/attendance/${userId}`).subscribe({
      next: (res: any) => this.attendanceRecords = res.data,
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to load attendance');
      }
    });
  }

  markAttendance() {
    if (!navigator.geolocation) {
      this.statusMessage = 'Geolocation is not supported by your browser';
      return;
    }

    this.loading = true;
    const todayRecord = this.attendanceRecords.find(r => {
      const d = new Date(r.date);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    });

    if (todayRecord && !todayRecord.checkOutTime) {
      this.checkOut();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.http.post(`http://localhost:5000/api/attendance/checkin/${this.authService.currentUserValue.id}`, {
          latitude,
          longitude
        }).subscribe({
          next: (res: any) => {
            this.loading = false;
            this.statusMessage = 'Checked in successfully!';
            this.loadAttendance();
          },
          error: (err) => {
            this.loading = false;
            this.statusMessage = err.error?.error || 'Check-in failed';
          }
        });
      },
      (err) => {
        this.loading = false;
        this.statusMessage = 'Location access denied. Please enable GPS.';
      }
    );
  }

  checkOut() {
    this.http.put(`http://localhost:5000/api/attendance/checkout/${this.authService.currentUserValue.id}`, {}).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.statusMessage = 'Checked out successfully!';
        this.loadAttendance();
      },
      error: (err) => {
        this.loading = false;
        this.statusMessage = err.error?.error || 'Check-out failed';
      }
    });
  }
}
