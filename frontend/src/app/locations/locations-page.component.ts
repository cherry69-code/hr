import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import * as L from 'leaflet';

@Component({
  selector: 'app-locations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './locations-page.component.html'
})
export class LocationsPageComponent implements OnInit {
  private http = inject(HttpClient);

  locations: any[] = [];
  loading = false;
  showModal = false;
  isEditing = false;
  currentId: string | null = null;
  private map: any;
  private pickerMap: any;
  private pickerMarker: any;
  private renderedLayers: any[] = [];

  form = {
    name: '',
    latitude: 0,
    longitude: 0,
    radius: 20,
    active: true
  };

  ngOnInit() {
    this.loadLocations();
  }

  loadLocations() {
    this.loading = true;
    this.http.get(`${environment.apiUrl}/locations`).subscribe({
      next: (res: any) => {
        this.locations = res.data;
        this.loading = false;
        setTimeout(() => this.initMap(), 0);
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  initMap() {
    const defaultLat = this.locations[0]?.latitude || 12.9716;
    const defaultLng = this.locations[0]?.longitude || 77.5946;
    if (!this.map) {
      this.map = L.map('locationsAdminMap').setView([defaultLat, defaultLng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.map);
    }
    this.renderMap();
    try { this.map.invalidateSize(); } catch {}
  }

  renderMap() {
    if (!this.map) return;
    for (const layer of this.renderedLayers) {
      try { this.map.removeLayer(layer); } catch {}
    }
    this.renderedLayers = [];

    const points: any[] = [];
    for (const loc of this.locations || []) {
      if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') continue;
      points.push([loc.latitude, loc.longitude]);
      const marker = L.marker([loc.latitude, loc.longitude]).addTo(this.map).bindPopup(`${loc.name} (${loc.radius || 20}m)`);
      const circle = L.circle([loc.latitude, loc.longitude], { radius: loc.radius || 20, color: '#16A34A', fillColor: '#16A34A', fillOpacity: 0.08 }).addTo(this.map);
      this.renderedLayers.push(marker, circle);
    }
    if (points.length) {
      try { this.map.fitBounds(L.latLngBounds(points), { padding: [30, 30] }); } catch {}
    }
  }

  openCreate() {
    this.isEditing = false;
    this.currentId = null;
    this.form = { name: '', latitude: 0, longitude: 0, radius: 20, active: true };
    this.showModal = true;
    setTimeout(() => this.initPickerMap(), 0);
  }

  openEdit(loc: any) {
    this.isEditing = true;
    this.currentId = loc._id;
    this.form = {
      name: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius: loc.radius || 20,
      active: loc.active !== false
    };
    this.showModal = true;
    setTimeout(() => this.initPickerMap(), 0);
  }

  closeModal() {
    this.showModal = false;
  }

  initPickerMap() {
    const lat = Number(this.form.latitude || 12.9716);
    const lng = Number(this.form.longitude || 77.5946);
    if (!this.pickerMap) {
      this.pickerMap = L.map('locationPickerMap').setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.pickerMap);
      this.pickerMap.on('click', (e: any) => {
        const p = e?.latlng;
        if (!p) return;
        this.form.latitude = Number(p.lat);
        this.form.longitude = Number(p.lng);
        if (this.pickerMarker) {
          try { this.pickerMarker.setLatLng([p.lat, p.lng]); } catch {}
        } else {
          this.pickerMarker = L.marker([p.lat, p.lng], { draggable: true }).addTo(this.pickerMap);
          this.pickerMarker.on('dragend', () => {
            const m = this.pickerMarker.getLatLng();
            this.form.latitude = Number(m.lat);
            this.form.longitude = Number(m.lng);
          });
        }
      });
    }
    if (this.pickerMarker) {
      try { this.pickerMarker.setLatLng([lat, lng]); } catch {}
    } else {
      this.pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(this.pickerMap);
      this.pickerMarker.on('dragend', () => {
        const m = this.pickerMarker.getLatLng();
        this.form.latitude = Number(m.lat);
        this.form.longitude = Number(m.lng);
      });
    }
    try { this.pickerMap.setView([lat, lng], 15); } catch {}
    try { this.pickerMap.invalidateSize(); } catch {}
  }

  save() {
    if (this.isEditing && this.currentId) {
      this.http.put(`${environment.apiUrl}/locations/${this.currentId}`, this.form).subscribe({
        next: () => {
          this.showModal = false;
          this.loadLocations();
        }
      });
      return;
    }

    this.http.post(`${environment.apiUrl}/locations`, this.form).subscribe({
      next: () => {
        this.showModal = false;
        this.loadLocations();
      }
    });
  }

  delete(loc: any) {
    if (!confirm(`Delete location "${loc.name}"?`)) return;
    this.http.delete(`${environment.apiUrl}/locations/${loc._id}`).subscribe({
      next: () => this.loadLocations()
    });
  }
}
