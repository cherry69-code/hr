import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

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
    this.http.get('http://localhost:5000/api/locations').subscribe({
      next: (res: any) => {
        this.locations = res.data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  openCreate() {
    this.isEditing = false;
    this.currentId = null;
    this.form = { name: '', latitude: 0, longitude: 0, radius: 20, active: true };
    this.showModal = true;
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
  }

  closeModal() {
    this.showModal = false;
  }

  save() {
    if (this.isEditing && this.currentId) {
      this.http.put(`http://localhost:5000/api/locations/${this.currentId}`, this.form).subscribe({
        next: () => {
          this.showModal = false;
          this.loadLocations();
        }
      });
      return;
    }

    this.http.post('http://localhost:5000/api/locations', this.form).subscribe({
      next: () => {
        this.showModal = false;
        this.loadLocations();
      }
    });
  }

  delete(loc: any) {
    if (!confirm(`Delete location "${loc.name}"?`)) return;
    this.http.delete(`http://localhost:5000/api/locations/${loc._id}`).subscribe({
      next: () => this.loadLocations()
    });
  }
}

