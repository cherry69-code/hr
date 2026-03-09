import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { LocationsPageComponent } from '../locations/locations-page.component';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';
import * as L from 'leaflet';

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
  // Offsite modal
  showOffsite = false;
  // Map instance (Leaflet)
  private map: any;
  private userMarker: any;

  get isAdmin() {
    return this.role === 'admin';
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
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const userIcon = L.divIcon({ className: 'custom-user', html: '<div style=\"background:#3b82f6;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.3)\"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
      if (this.userMarker) { try { this.map.removeLayer(this.userMarker); } catch {} }
      this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map).bindPopup('You are here');
      this.computeNearest(lat, lng);
      const points: any[] = [[lat, lng], ...this.locations.map(l => [l.latitude, l.longitude])];
      this.map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
      try { this.map.invalidateSize(); } catch {}
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
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        // If outside radius -> show offsite popup
        this.computeNearest(latitude, longitude);
        const todayRecord = this.attendanceRecords.find(r => {
          const d = new Date(r.date);
          const today = new Date();
          return d.toDateString() === today.toDateString();
        });
        if (todayRecord && !todayRecord.checkOutTime) {
          this.checkOutAt(latitude, longitude);
          return;
        }
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
