import { Component, OnInit, inject, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { DocumentService } from '../services/document.service';
import { SignaturePadComponent } from '../shared/components/signature-pad/signature-pad.component';
import { ToastService } from '../services/toast.service';
import * as L from 'leaflet';
import { RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { getBestPosition } from '../utils/geolocation';

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
export class EmployeeHomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  public authService = inject(AuthService);
  private documentService = inject(DocumentService);
  private toast = inject(ToastService);

  user = this.authService.currentUserValue;
  currentDate = new Date();
  daysInMonth: any[] = [];
  attendanceRecords: any[] = [];
  approvedLeaveDates = new Set<string>();
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
    optional: 2,
    annual: 12,
    sick: 5,
    unpaid: 0,
    compOff: 0
  };

  stats = {
    avgWorkingHours: '00:00 Hrs',
    onTimeArrival: '0%',
    averageTime: '--:--'
  };

  leaderboardTop: any[] = [];
  myPerformance: any = null;
  topPerformer: any = null;
  weeklyTop: any[] = [];
  myIncentive: any = null;
  private leaderboardTimer: any = null;

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
      this.loadLeaderboard();

      this.leaderboardTimer = setInterval(() => this.loadLeaderboard(), 30000);
    }
  }

  ngAfterViewInit() {
    if (!this.user) return;
    this.loadLocations();
  }

  ngOnDestroy() {
    if (this.leaderboardTimer) {
      clearInterval(this.leaderboardTimer);
      this.leaderboardTimer = null;
    }
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
    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    const defaultLat = this.locations[0]?.latitude || 12.9716;
    const defaultLng = this.locations[0]?.longitude || 77.5946;

    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([defaultLat, defaultLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);

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
      getBestPosition({ timeoutMs: 12000, desiredAccuracyMeters: 60 })
        .then((position) => {
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
        })
        .catch(() => {});
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

    getBestPosition({ timeoutMs: 12000, desiredAccuracyMeters: 60 })
      .then((position) => {
        const accuracy = typeof position.coords.accuracy === 'number' ? Math.round(position.coords.accuracy) : null;
        if (accuracy !== null && accuracy > 500) {
          this.statusMessage = 'GPS accuracy is low on desktop. Turn on Windows Location Services and disable VPN, then try again.';
          this.loading = false;
          return;
        }

        const payload = { latitude: position.coords.latitude, longitude: position.coords.longitude };

        this.computeNearestLocation(payload.latitude, payload.longitude);
        if (this.mapInitialized) {
          this.renderUserLocation();
        }

        this.http.post(`${environment.apiUrl}/attendance/checkin/${this.user.id}`, payload).subscribe({
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
      })
      .catch(() => {
        this.statusMessage = 'Location access denied or unavailable';
        this.loading = false;
      });
  }

  checkOut() {
    this.loading = true;
    this.http.put(`${environment.apiUrl}/attendance/checkout/${this.user.id}`, {}).subscribe({
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

    this.http.get(`${environment.apiUrl}/attendance/${this.user.id}`).subscribe({
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
    if (!this.attendanceRecords.length) {
      this.resetStats();
      return;
    }

    const currentYear = this.currentDate.getFullYear();
    const currentMonth = this.currentDate.getMonth();

    // Filter records for the currently displayed month
    const monthlyRecords = this.attendanceRecords.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate.getFullYear() === currentYear && recordDate.getMonth() === currentMonth;
    });

    if (monthlyRecords.length === 0) {
      this.resetStats();
      return;
    }

    let totalWorkMs = 0;
    let workDaysCount = 0;
    let onTimeCount = 0;
    let totalCheckInMinutes = 0;
    let validCheckInCount = 0;

    monthlyRecords.forEach(record => {
      // Avg Working Hours
      // Only count completed shifts (with check-out)
      if (record.checkInTime && record.checkOutTime) {
        totalWorkMs += new Date(record.checkOutTime).getTime() - new Date(record.checkInTime).getTime();
        workDaysCount++;
      }

      // On Time Arrival (Late Check-in > 10:00 AM)
      if (record.checkInTime) {
        const checkIn = new Date(record.checkInTime);
        const threshold = new Date(checkIn);
        threshold.setHours(10, 0, 0, 0); // 10:00 AM Policy

        if (checkIn <= threshold) {
          onTimeCount++;
        }

        // Average Check-in Time
        totalCheckInMinutes += checkIn.getHours() * 60 + checkIn.getMinutes();
        validCheckInCount++;
      }
    });

    // Avg Working Hours
    if (workDaysCount > 0) {
      const avgMs = totalWorkMs / workDaysCount;
      const hours = Math.floor(avgMs / (1000 * 60 * 60));
      const minutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
      this.stats.avgWorkingHours = `${hours}:${minutes.toString().padStart(2, '0')} Hrs`;
    } else {
      this.stats.avgWorkingHours = '00:00 Hrs';
    }

    // On Time Arrival
    // Calculate percentage based on total valid check-ins for the month
    this.stats.onTimeArrival = validCheckInCount > 0 ? `${Math.round((onTimeCount / validCheckInCount) * 100)}%` : '0%';

    // Average Check-in Time
    if (validCheckInCount > 0) {
      const avgMinutes = totalCheckInMinutes / validCheckInCount;
      const hours = Math.floor(avgMinutes / 60);
      const minutes = Math.floor(avgMinutes % 60);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      this.stats.averageTime = `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
    } else {
      this.stats.averageTime = '--:--';
    }
  }

  resetStats() {
    this.stats = {
      avgWorkingHours: '00:00 Hrs',
      onTimeArrival: '0%',
      averageTime: '--:--'
    };
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
      // If approved leave covers this day, mark as 'leave' unless explicitly present
      const key = day.date.toDateString();
      if (this.approvedLeaveDates.has(key) && day.status !== 'present') {
        day.status = 'leave';
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

  loadLeaderboard() {
    const d = new Date();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();

    this.http.get(`${environment.apiUrl}/leaderboard/monthly?month=${month}&year=${year}&top=10`).subscribe({
      next: (res: any) => {
        this.leaderboardTop = res.data || [];
        this.topPerformer = res.topPerformer || null;
      },
      error: () => {
        this.leaderboardTop = [];
        this.topPerformer = null;
      }
    });

    this.http.get(`${environment.apiUrl}/leaderboard/me?month=${month}&year=${year}`).subscribe({
      next: (res: any) => this.myPerformance = res.data || null,
      error: () => this.myPerformance = null
    });

    this.http.get(`${environment.apiUrl}/incentives/calculations?month=${month}&year=${year}`).subscribe({
      next: (res: any) => this.myIncentive = (res.data && res.data.length ? res.data[0] : null),
      error: () => this.myIncentive = null
    });

    this.http.get(`${environment.apiUrl}/leaderboard/weekly?top=10`).subscribe({
      next: (res: any) => this.weeklyTop = res.data || [],
      error: () => this.weeklyTop = []
    });
  }

  loadLeaves() {
    this.http.get(`${environment.apiUrl}/leaves?employeeId=${this.user.id}`).subscribe({
      next: (res: any) => {
        const leaves = res.data;
        const approved = (leaves || []).filter((l: any) => l && l.status === 'approved');
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        yearStart.setHours(0, 0, 0, 0);
        yearEnd.setHours(23, 59, 59, 999);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthStart.setHours(0, 0, 0, 0);
        monthEnd.setHours(23, 59, 59, 999);

        const countDays = (fromDate: any, toDate: any, rangeStart: Date, rangeEnd: Date) => {
          const s = new Date(fromDate);
          const e = new Date(toDate);
          if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
          s.setHours(0, 0, 0, 0);
          e.setHours(0, 0, 0, 0);
          const start = s.getTime() < rangeStart.getTime() ? new Date(rangeStart) : s;
          const end = e.getTime() > rangeEnd.getTime() ? new Date(rangeEnd) : e;
          start.setHours(0, 0, 0, 0);
          end.setHours(0, 0, 0, 0);
          if (start.getTime() > end.getTime()) return 0;
          let days = 0;
          const cur = new Date(start);
          while (cur.getTime() <= end.getTime()) {
            days += 1;
            cur.setDate(cur.getDate() + 1);
          }
          return days;
        };

        const usedAnnualDays = approved
          .filter((l: any) => l.leaveType === 'Paid Leave')
          .reduce((sum: number, l: any) => sum + countDays(l.fromDate, l.toDate, yearStart, yearEnd), 0);

        const usedSickDays = approved
          .filter((l: any) => l.leaveType === 'Sick Leave')
          .reduce((sum: number, l: any) => sum + countDays(l.fromDate, l.toDate, yearStart, yearEnd), 0);

        const usedCasualDaysThisMonth = approved
          .filter((l: any) => l.leaveType === 'Casual Leave')
          .reduce((sum: number, l: any) => sum + countDays(l.fromDate, l.toDate, monthStart, monthEnd), 0);

        this.leaveSummary.annual = Math.max(0, 12 - usedAnnualDays);
        this.leaveSummary.sick = Math.max(0, 5 - usedSickDays);
        this.leaveSummary.optional = Math.max(0, 2 - usedCasualDaysThisMonth);

        // Build approved leave day set for calendar marking
        this.approvedLeaveDates.clear();
        leaves
          .filter((l: any) => l.status === 'approved')
          .forEach((l: any) => {
            const start = new Date(l.fromDate);
            const end = new Date(l.toDate);
            const cur = new Date(start);
            cur.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);
            while (cur.getTime() <= end.getTime()) {
              this.approvedLeaveDates.add(cur.toDateString());
              cur.setDate(cur.getDate() + 1);
            }
          });
        this.mapAttendanceToCalendar();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to load leaves')
    });
  }

  prevMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.daysInMonth = [];
    this.generateCalendar();
    this.mapAttendanceToCalendar();
    this.calculateStats();
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.daysInMonth = [];
    this.generateCalendar();
    this.mapAttendanceToCalendar();
    this.calculateStats();
  }

  logout() {
    this.authService.logout();
  }
}
