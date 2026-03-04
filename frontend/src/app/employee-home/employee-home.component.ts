import { Component, OnInit, inject, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { DocumentService } from '../services/document.service';
import { SignaturePadComponent } from '../shared/components/signature-pad/signature-pad.component';
import { ToastService } from '../services/toast.service';
import * as L from 'leaflet';
import { RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-employee-home',
  standalone: true,
  imports: [CommonModule, SignaturePadComponent, RouterModule],
  templateUrl: './employee-home.component.html',
  styles: [`
    #map {
      height: 300px;
      width: 100%;
      border-radius: 1rem;
      z-index: 1;
    }
  `]
})
export class EmployeeHomeComponent implements OnInit, AfterViewInit {
  private http = inject(HttpClient);
  public authService = inject(AuthService);
  private documentService = inject(DocumentService);
  private toast = inject(ToastService);

  user = this.authService.currentUserValue;
  currentDate = new Date();
  daysInMonth: any[] = [];
  attendanceRecords: any[] = [];
  teamAttendance: any[] = [];
  locations: any[] = [];
  map: any;
  userMarker: any;
  locationMarkers: any[] = [];
  locationCircles: any[] = [];
  mapInitialized = false;

  showSignaturePad = false;

  nearestLocationName = '';
  nearestDistanceMeters: number | null = null;
  withinGeofence = false;
  isRemoteAllowedToday = false;

  todaySummary = {
    inTime: '--:--',
    outTime: '--:--',
    workHrs: '--:--',
    location: 'Unknown'
  };

  leaveSummary = {
    optional: 0,
    annual: 12,
    sick: 5,
    unpaid: 0,
    compOff: 0
  };

  stats = {
    avgWorkingHours: '08:42',
    onTimeArrival: '95%',
    averageTime: '09:15 AM'
  };

  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  get currentMonthName(): string {
    return this.currentDate.toLocaleString('default', { month: 'long' });
  }

  get currentYear(): number {
    return this.currentDate.getFullYear();
  }

  openSignaturePad() {
    this.showSignaturePad = true;
  }

  closeSignaturePad() {
    this.showSignaturePad = false;
  }

  onSignatureSaved(signatureData: string) {
    this.documentService.signDocument('offer_letter', signatureData).subscribe({
      next: () => {
        this.toast.success('Document signed and emailed successfully');
        this.showSignaturePad = false;
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to sign document');
      }
    });
  }

  loading = false;
  statusMessage = '';

  ngOnInit() {
    if (this.user) {
      // Check if remote is allowed today (Tue=2, Wed=3, Thu=4, Fri=5)
      // Monday (1) is Weekly Off
      const day = new Date().getDay();
      this.isRemoteAllowedToday = [2, 3, 4, 5].includes(day);

      this.generateCalendar();
      this.loadAttendance();
      this.loadTeamSummary();
      this.loadLeaves();
    }
  }

  ngAfterViewInit() {
    if (!this.user) return;
    this.loadLocations();
  }

  loadLocations() {
    this.http.get(`${environment.apiUrl}/locations/active`).subscribe({
      next: (res: any) => {
        this.locations = res.data || [];
        if (!this.mapInitialized) {
          this.initMap();
        } else {
          this.renderLocations();
        }
      },
      error: () => {
        this.locations = [];
      }
    });
  }

  initMap() {
    const defaultLat = this.locations[0]?.latitude || 12.9716;
    const defaultLng = this.locations[0]?.longitude || 77.5946;

    this.map = L.map('map').setView([defaultLat, defaultLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.mapInitialized = true;

    this.renderLocations();
    this.renderUserLocation();
  }

  renderLocations() {
    if (!this.map) return;

    for (const marker of this.locationMarkers) {
      try { this.map.removeLayer(marker); } catch {}
    }
    for (const circle of this.locationCircles) {
      try { this.map.removeLayer(circle); } catch {}
    }
    this.locationMarkers = [];
    this.locationCircles = [];

    const homeIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #0F172A; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
             </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    for (const loc of this.locations) {
      const marker = L.marker([loc.latitude, loc.longitude], { icon: homeIcon }).addTo(this.map);
      marker.bindPopup(`<b>${loc.name}</b><br/>Radius: ${loc.radius || 20}m`);
      this.locationMarkers.push(marker);

      const circle = L.circle([loc.latitude, loc.longitude], {
        color: '#16A34A',
        fillColor: '#16A34A',
        fillOpacity: 0.15,
        radius: loc.radius || 20
      }).addTo(this.map);
      this.locationCircles.push(circle);
    }
  }

  renderUserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const userIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: #3B82F6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        if (this.userMarker) {
          try { this.map.removeLayer(this.userMarker); } catch {}
        }
        this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map);

        this.computeNearestLocation(lat, lng);

        const points: any[] = [[lat, lng]];
        for (const loc of this.locations) {
          points.push([loc.latitude, loc.longitude]);
        }
        if (points.length > 1) {
          const bounds = L.latLngBounds(points);
          this.map.fitBounds(bounds, { padding: [50, 50] });
        } else {
          this.map.setView([lat, lng], 15);
        }
      });
    }
  }

  computeNearestLocation(lat: number, lng: number) {
    if (!this.locations.length) {
      this.nearestLocationName = '';
      this.nearestDistanceMeters = null;
      this.withinGeofence = false;
      return;
    }

    let best: any = null;
    for (const loc of this.locations) {
      const d = this.getDistanceMeters(lat, lng, loc.latitude, loc.longitude);
      if (!best || d < best.distance) {
        best = { location: loc, distance: d };
      }
    }

    this.nearestLocationName = best.location.name;
    this.nearestDistanceMeters = Math.round(best.distance);
    this.withinGeofence = best.distance <= (best.location.radius || 20);
  }

  getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  markAttendance() {
    if (!navigator.geolocation) {
      this.statusMessage = 'Geolocation is not supported by your browser';
      return;
    }

    this.loading = true;
    this.statusMessage = 'Getting location...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const payload = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        this.computeNearestLocation(payload.latitude, payload.longitude);
        if (this.mapInitialized) {
          this.renderUserLocation();
        }

        this.http.post(`http://localhost:5000/api/attendance/checkin/${this.user.id}`, payload).subscribe({
          next: (res: any) => {
            this.statusMessage = 'Checked in successfully!';
            this.loadAttendance();
            this.loading = false;
          },
          error: (err) => {
            this.statusMessage = err.error?.error || 'Failed to check in';
            this.loading = false;
          }
        });
      },
      (error) => {
        this.statusMessage = 'Location access denied or unavailable';
        this.loading = false;
      },
      { enableHighAccuracy: true }
    );
  }

  checkOut() {
    this.loading = true;
    this.http.put(`http://localhost:5000/api/attendance/checkout/${this.user.id}`, {}).subscribe({
      next: () => {
        this.statusMessage = 'Checked out successfully!';
        this.loadAttendance();
        this.loading = false;
      },
      error: (err) => {
        this.statusMessage = err.error?.error || 'Failed to check out';
        this.loading = false;
      }
    });
  }

  generateCalendar() {
    this.daysInMonth = [];
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Add empty slots
    for (let i = 0; i < firstDay.getDay(); i++) {
      this.daysInMonth.push({ date: null });
    }

    // Add actual days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      // Monday (1) is Weekly Off
      const isWeeklyOff = date.getDay() === 1;
      this.daysInMonth.push({
        date: date,
        day: i,
        status: isWeeklyOff ? 'weekend' : 'absent'
      });
    }
  }

  loadAttendance() {
    if (!this.user) return;

    this.http.get(`http://localhost:5000/api/attendance/${this.user.id}`).subscribe({
      next: (res: any) => {
        this.attendanceRecords = res.data;
        this.mapAttendanceToCalendar();
        this.calculateTodaySummary();
        this.calculateStats();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to load attendance')
    });
  }

  calculateStats() {
    if (!this.attendanceRecords.length) return;

    let totalWorkMs = 0;
    let workDaysCount = 0;
    let onTimeCount = 0;
    let totalCheckInMinutes = 0;

    this.attendanceRecords.forEach(record => {
      // Avg Working Hours
      if (record.checkInTime && record.checkOutTime) {
        totalWorkMs += new Date(record.checkOutTime).getTime() - new Date(record.checkInTime).getTime();
        workDaysCount++;
      }

      // On Time Arrival (assuming 9:30 AM is late)
      const checkIn = new Date(record.checkInTime);
      const threshold = new Date(checkIn);
      threshold.setHours(9, 30, 0, 0);
      if (checkIn <= threshold) {
        onTimeCount++;
      }

      // Average Check-in Time
      totalCheckInMinutes += checkIn.getHours() * 60 + checkIn.getMinutes();
    });

    const totalRecords = this.attendanceRecords.length;

    // Avg Working Hours
    if (workDaysCount > 0) {
      const avgMs = totalWorkMs / workDaysCount;
      const hours = Math.floor(avgMs / (1000 * 60 * 60));
      const minutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
      this.stats.avgWorkingHours = `${hours}:${minutes.toString().padStart(2, '0')}`;
    }

    // On Time Arrival
    this.stats.onTimeArrival = totalRecords > 0 ? `${Math.round((onTimeCount / totalRecords) * 100)}%` : '0%';

    // Average Check-in Time
    if (totalRecords > 0) {
      const avgMinutes = totalCheckInMinutes / totalRecords;
      const hours = Math.floor(avgMinutes / 60);
      const minutes = Math.floor(avgMinutes % 60);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      this.stats.averageTime = `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
  }

  mapAttendanceToCalendar() {
    this.daysInMonth = this.daysInMonth.map(day => {
      if (!day.date) return day;

      const record = this.attendanceRecords.find(r =>
        new Date(r.date).toDateString() === day.date.toDateString()
      );

      if (record) {
        day.status = record.status.toLowerCase(); // present, absent, late
      }
      // Keep existing status (weekend/absent) if no record found
      return day;
    });
  }

  isCheckedIn = false;
  isCheckedOut = false;

  calculateTodaySummary() {
    const todayRecord = this.attendanceRecords.find(r =>
      new Date(r.date).toDateString() === new Date().toDateString()
    );

    if (todayRecord) {
      this.isCheckedIn = true;
      this.isCheckedOut = !!todayRecord.checkOutTime;

      this.todaySummary.inTime = new Date(todayRecord.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.todaySummary.outTime = todayRecord.checkOutTime ? new Date(todayRecord.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      this.todaySummary.location = todayRecord.locationName || (todayRecord.locationValidated ? 'Verified Location' : 'Remote / Unverified');

      if (todayRecord.checkOutTime) {
        const diff = new Date(todayRecord.checkOutTime).getTime() - new Date(todayRecord.checkInTime).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        this.todaySummary.workHrs = `${hours}h ${minutes}m`;
      } else {
        this.todaySummary.workHrs = 'Working...';
      }
    } else {
      this.isCheckedIn = false;
      this.isCheckedOut = false;
      this.todaySummary = {
        inTime: '--:--',
        outTime: '--:--',
        workHrs: '--:--',
        location: 'Unknown'
      };
    }
  }

  handlePunch() {
    if (this.isCheckedIn && !this.isCheckedOut) {
      this.checkOut();
    } else if (!this.isCheckedIn) {
      this.markAttendance();
    }
  }

  loadTeamSummary() {
    this.http.get(`${environment.apiUrl}/attendance/summary/team`).subscribe({
      next: (res: any) => this.teamAttendance = res.data,
      error: (err) => this.toast.error(err.error?.error || 'Failed to load team summary')
    });
  }

  loadLeaves() {
    this.http.get(`http://localhost:5000/api/leaves?employeeId=${this.user.id}`).subscribe({
      next: (res: any) => {
        const leaves = res.data;
        const usedAnnual = leaves.filter((l: any) => l.leaveType === 'Paid Leave' && l.status === 'approved').length;
        const usedCasual = leaves.filter((l: any) => l.leaveType === 'Casual Leave' && l.status === 'approved').length;
        const usedSick = leaves.filter((l: any) => l.leaveType === 'Sick Leave' && l.status === 'approved').length;

        this.leaveSummary.annual = 12 - usedAnnual;
        this.leaveSummary.optional = 10 - usedCasual;
        this.leaveSummary.sick = 5 - usedSick;
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to load leaves')
    });
  }

  prevMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.daysInMonth = [];
    this.generateCalendar();
    this.mapAttendanceToCalendar();
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.daysInMonth = [];
    this.generateCalendar();
    this.mapAttendanceToCalendar();
  }

  logout() {
    this.authService.logout();
  }
}
