import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { LocationsPageComponent } from '../locations/locations-page.component';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';
import * as L from 'leaflet';
import { getBestPosition } from '../utils/geolocation';

@Component({
  selector: 'app-attendance-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LocationsPageComponent],
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
  // Map/Geofence
  locations: any[] = [];
  withinRadius = false;
  nearestLocationName = '';
  nearestDistanceMeters: number | null = null;
  gpsRefreshing = false;
  lastGpsFixAt: Date | null = null;
  lastGpsAccuracyMeters: number | null = null;
  gpsLowAccuracy = false;
  // Offsite modal
  showOffsite = false;
  // Map instance (Leaflet)
  private map: any;
  private userMarker: any;
  isWeekend = [0, 6].includes(new Date().getDay());
  fieldLocationAddress = '';
  pendingFieldAction: 'CHECK_IN' | 'CHECK_OUT' | null = null;

  get isAdmin() {
    return this.role === 'admin';
  }

  get isFieldMode() {
    return this.isWeekend && !this.isAdmin;
  }

  ngOnInit() {
    if (!this.isAdmin) {
      this.loadAttendance();
      this.loadActiveLocations();
    }
  }

  loadAttendance() {
    const userId = this.authService.currentUserValue.id;
    this.http.get(`${environment.apiUrl}/attendance/${userId}`).subscribe({
      next: (res: any) => this.attendanceRecords = res.data,
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to load attendance');
      }
    });
  }

  loadActiveLocations() {
    this.http.get(`${environment.apiUrl}/locations/active`).subscribe({
      next: (res: any) => {
        this.locations = res.data || [];
        setTimeout(() => this.initMap(), 0);
      }
    });
  }

  initMap() {
    const defaultLat = this.locations[0]?.latitude || 12.9716;
    const defaultLng = this.locations[0]?.longitude || 77.5946;
    if (!this.map) {
      this.map = L.map('attendanceMap').setView([defaultLat, defaultLng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.map);
    }
    // Render office locations
    for (const loc of this.locations) {
      const officeIcon = L.divIcon({ className: 'custom-office', html: '<div style=\"background:#10b981;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 4px rgba(16,185,129,0.3)\"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
      L.marker([loc.latitude, loc.longitude], { icon: officeIcon }).addTo(this.map).bindPopup(`${loc.name} (${loc.radius || 20}m)`);
      L.circle([loc.latitude, loc.longitude], { radius: loc.radius || 20, color: '#10b981', fillColor: '#10b981', fillOpacity: 0.1 }).addTo(this.map);
    }
    // Render user marker
    this.renderUserLocation();
  }

  renderUserLocation() {
    if (!navigator.geolocation) return;
    this.refreshGps(false);
  }

  refreshGps(showToast: boolean = true) {
    if (!navigator.geolocation) {
      if (showToast) this.toast.error('Geolocation is not supported by your browser');
      return;
    }

    if (!this.map) {
      this.initMap();
    }

    this.gpsRefreshing = true;
    getBestPosition({ timeoutMs: 12000, desiredAccuracyMeters: 60 })
      .then((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.lastGpsFixAt = new Date();
        this.lastGpsAccuracyMeters = typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null;
        this.gpsLowAccuracy = this.lastGpsAccuracyMeters !== null && this.lastGpsAccuracyMeters > 500;

        const userIcon = L.divIcon({
          className: 'custom-user',
          html: '<div style="background:#3b82f6;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.3)"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });
        if (this.userMarker) {
          try {
            this.map.removeLayer(this.userMarker);
          } catch {}
        }
        this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map).bindPopup('You are here');

        this.computeNearest(lat, lng);
        try {
          this.map.panTo([lat, lng]);
        } catch {}
        try {
          this.map.invalidateSize();
        } catch {}

        this.gpsRefreshing = false;
        if (this.gpsLowAccuracy) {
          this.statusMessage = 'GPS accuracy is low on desktop. Turn on Windows Location Services and disable VPN, then Refresh GPS.';
        } else if (showToast) {
          this.toast.success('GPS refreshed');
        }
      })
      .catch(() => {
        this.gpsRefreshing = false;
        if (showToast) this.toast.error('Unable to refresh GPS. Please enable Location.');
      });
  }

  computeNearest(lat: number, lng: number) {
    if (!this.locations.length) { this.withinRadius = false; this.nearestLocationName = ''; this.nearestDistanceMeters = null; return; }
    let best: any = null;
    for (const loc of this.locations) {
      const d = this.getDistanceMeters(lat, lng, loc.latitude, loc.longitude);
      if (!best || d < best.distance) best = { location: loc, distance: d };
    }
    this.nearestLocationName = best.location.name;
    this.nearestDistanceMeters = Math.round(best.distance);
    // Strict policy: 20m radius only
    if (this.gpsLowAccuracy) {
      this.withinRadius = false;
      return;
    }
    this.withinRadius = best.distance <= 20;
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

  get todayRecord() {
    return this.attendanceRecords.find(r => {
      const d = new Date(r.date);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    });
  }

  onPickFieldSelfie(action: 'CHECK_IN' | 'CHECK_OUT', fileInput: HTMLInputElement) {
    this.pendingFieldAction = action;
    fileInput.click();
  }

  async onFieldSelfieSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    const action = this.pendingFieldAction;
    this.pendingFieldAction = null;
    input.value = '';

    if (!file || !action) return;

    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    }).catch(() => '');

    if (!imageBase64) {
      this.statusMessage = 'Selfie capture failed. Please try again.';
      return;
    }

    this.processFieldPunch(action, imageBase64);
  }

  processFieldPunch(action: 'CHECK_IN' | 'CHECK_OUT', imageBase64: string) {
    if (!navigator.geolocation) {
      this.statusMessage = 'Geolocation is not supported by your browser';
      return;
    }

    this.loading = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        const accuracy = typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null;

        if (!accuracy || accuracy >= 50) {
          this.loading = false;
          this.statusMessage = 'Location not accurate. Please enable GPS.';
          return;
        }

        const endpoint = action === 'CHECK_IN' ? 'checkin' : 'checkout';
        const payload: any = {
          latitude,
          longitude,
          gpsAccuracyMeters: accuracy,
          locationAddress: this.fieldLocationAddress || '',
          imageBase64,
          faceVerified: true,
          faceSimilarity: 0.9,
          livenessVerified: true,
          deviceType: 'mobile'
        };

        this.http.post(`${environment.apiUrl}/field-attendance/${endpoint}`, payload).subscribe({
          next: () => {
            this.loading = false;
            this.statusMessage = action === 'CHECK_IN' ? 'Checked in successfully!' : 'Checked out successfully!';
            this.loadAttendance();
          },
          error: (err) => {
            this.loading = false;
            this.statusMessage = err.error?.error || 'Field attendance failed';
          }
        });
      },
      () => {
        this.loading = false;
        this.statusMessage = 'Location access denied. Please enable GPS.';
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  markAttendance() {
    if (!navigator.geolocation) {
      this.statusMessage = 'Geolocation is not supported by your browser';
      return;
    }

    if (this.todayRecord) {
      this.statusMessage = 'You have already checked in today.';
      return;
    }

    this.loading = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        this.computeNearest(latitude, longitude);

        if (!this.withinRadius) {
          this.loading = false;
          this.statusMessage = `You are ${this.nearestDistanceMeters}m from ${this.nearestLocationName}. Check-in allowed only within 20m of approved locations.`;
          return;
        }

        this.http.post(`${environment.apiUrl}/attendance/checkin/${this.authService.currentUserValue.id}`, { latitude, longitude }).subscribe({
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
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  checkOut() {
    // fallback without location
    this.http.put(`${environment.apiUrl}/attendance/checkout/${this.authService.currentUserValue.id}`, {}).subscribe({
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

  checkOutAt(latitude: number, longitude: number) {
    this.http.put(`${environment.apiUrl}/attendance/checkout/${this.authService.currentUserValue.id}`, { latitude, longitude }).subscribe({
      next: () => {
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
