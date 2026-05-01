import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
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
export class AttendancePageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('captureCanvas') captureCanvas?: ElementRef<HTMLCanvasElement>;

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
  todayDay = new Date().getDay();
  fieldLocationAddress = '';
  pendingFieldAction: 'CHECK_IN' | 'CHECK_OUT' | null = null;
  pendingOfficeAction: 'CHECK_IN' | null = null;
  showCameraCapture = false;
  cameraBusy = false;
  cameraError = '';
  cameraTarget: 'office' | 'field' | null = null;
  private cameraStream: MediaStream | null = null;

  get isAdmin() {
    return this.role === 'admin';
  }

  get isFieldMode() {
    return false;
  }

  get isGeoAttendanceAllowedDay() {
    return this.todayDay !== 1;
  }

  private async fileToDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
  }

  private dataUrlBytes(dataUrl: string): number {
    return Math.floor(String(dataUrl || '').replace(/^data:.+;base64,/, '').length * 0.75);
  }

  private async compressImage(file: File, maxBytes: number = 220 * 1024): Promise<string> {
    const originalDataUrl = await this.fileToDataUrl(file);
    if (this.dataUrlBytes(originalDataUrl) <= maxBytes) return originalDataUrl;

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = originalDataUrl;
    });

    let best = originalDataUrl;
    const canvas = document.createElement('canvas');
    const dimensions = [1280, 1024, 900, 768, 640, 540, 480, 420, 360, 320];
    const qualities = [0.72, 0.62, 0.52, 0.42, 0.35, 0.28, 0.22];

    for (const maxDimension of dimensions) {
      let width = image.width;
      let height = image.height;
      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height >= width && height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return originalDataUrl;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const candidate = canvas.toDataURL('image/jpeg', quality);
        if (this.dataUrlBytes(candidate) < this.dataUrlBytes(best)) {
          best = candidate;
        }
        if (this.dataUrlBytes(candidate) <= maxBytes) {
          return candidate;
        }
      }
    }

    if (this.dataUrlBytes(best) > 3 * 1024 * 1024) {
      throw new Error('Compressed selfie is still too large');
    }
    return best;
  }

  ngOnInit() {
    if (!this.isAdmin) {
      this.loadAttendance();
      this.loadActiveLocations();
      if (!this.isGeoAttendanceAllowedDay) {
        this.statusMessage = 'Geo attendance is allowed only from Tuesday to Sunday.';
      }
    }
  }

  ngOnDestroy() {
    this.stopCameraStream();
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
    const allowedRadius = Math.max(1, Number(best.location.radius || 20));
    if (this.gpsLowAccuracy) {
      this.withinRadius = false;
      return;
    }
    this.withinRadius = best.distance <= allowedRadius;
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
    this.openCameraCapture('field', fileInput);
  }

  onPickOfficeSelfie(fileInput: HTMLInputElement) {
    this.pendingOfficeAction = 'CHECK_IN';
    this.openCameraCapture('office', fileInput);
  }

  private canUseCameraCapture(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private openCameraCapture(target: 'office' | 'field', fallbackInput: HTMLInputElement) {
    if (!this.canUseCameraCapture()) {
      fallbackInput.click();
      return;
    }
    this.cameraTarget = target;
    this.showCameraCapture = true;
    this.cameraBusy = true;
    this.cameraError = '';
    this.startCameraStream().catch(() => {
      this.cameraBusy = false;
      this.showCameraCapture = false;
      this.cameraTarget = null;
      fallbackInput.click();
    });
  }

  private async startCameraStream() {
    this.stopCameraStream();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640, max: 640 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: 12, max: 15 }
      },
      audio: false
    });
    this.cameraStream = stream;

    setTimeout(async () => {
      const video = this.cameraVideo?.nativeElement;
      if (!video || !this.cameraStream) return;
      video.srcObject = this.cameraStream;
      try {
        await video.play();
        this.cameraBusy = false;
      } catch {
        this.cameraError = 'Unable to start camera preview.';
        this.cameraBusy = false;
      }
    }, 0);
  }

  cancelCameraCapture() {
    this.showCameraCapture = false;
    this.cameraBusy = false;
    this.cameraError = '';
    this.cameraTarget = null;
    this.stopCameraStream();
  }

  private stopCameraStream() {
    if (!this.cameraStream) return;
    for (const track of this.cameraStream.getTracks()) {
      try {
        track.stop();
      } catch {}
    }
    this.cameraStream = null;
    const video = this.cameraVideo?.nativeElement;
    if (video) {
      try {
        video.pause();
      } catch {}
      video.srcObject = null;
    }
  }

  private canvasToFile(dataUrl: string, fileName: string): File {
    const parts = dataUrl.split(',');
    const mime = (parts[0].match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
    const binary = atob(parts[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], fileName, { type: mime });
  }

  async captureSelfie() {
    if (this.cameraBusy) return;
    const video = this.cameraVideo?.nativeElement;
    const canvas = this.captureCanvas?.nativeElement;
    if (!video || !canvas) {
      this.cameraError = 'Camera not ready.';
      return;
    }

    this.cameraBusy = true;
    this.cameraError = '';
    const width = Math.max(240, Math.min(480, video.videoWidth || 480));
    const height = Math.max(320, Math.min(640, video.videoHeight || 640));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.cameraBusy = false;
      this.cameraError = 'Camera capture failed.';
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.45);
    const file = this.canvasToFile(dataUrl, `selfie-${Date.now()}.jpg`);

    this.stopCameraStream();
    this.showCameraCapture = false;
    this.cameraBusy = false;

    if (this.cameraTarget === 'office') {
      await this.handleOfficeSelfieFile(file);
    } else if (this.cameraTarget === 'field') {
      await this.handleFieldSelfieFile(file);
    }
    this.cameraTarget = null;
  }

  async onFieldSelfieSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    const action = this.pendingFieldAction;
    this.pendingFieldAction = null;
    input.value = '';

    if (!file || !action) return;
    await this.handleFieldSelfieFile(file);
  }

  async onOfficeSelfieSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    const action = this.pendingOfficeAction;
    this.pendingOfficeAction = null;
    input.value = '';

    if (!file || !action) return;
    await this.handleOfficeSelfieFile(file);
  }

  private async handleFieldSelfieFile(file: File) {
    const action = this.pendingFieldAction;
    this.pendingFieldAction = null;
    if (!file || !action) return;

    const imageBase64 = await this.compressImage(file).catch(() => '');
    if (!imageBase64) {
      this.statusMessage = 'Selfie capture failed. Please try again.';
      return;
    }
    this.processFieldPunch(action, imageBase64);
  }

  private async handleOfficeSelfieFile(file: File) {
    const action = this.pendingOfficeAction;
    this.pendingOfficeAction = null;
    if (!file || !action) return;
    if (!this.isGeoAttendanceAllowedDay) {
      this.statusMessage = 'Geo attendance is allowed only from Tuesday to Sunday.';
      return;
    }
    if (this.todayRecord) {
      this.statusMessage = 'You have already checked in today.';
      return;
    }

    const photoBase64 = await this.compressImage(file).catch(() => '');
    if (!photoBase64) {
      this.statusMessage = 'Selfie capture failed. Please try again.';
      return;
    }

    this.loading = true;
    this.statusMessage = 'Verifying face and location...';

    const faceOk = await this.detectFace(photoBase64).catch(() => true);
    if (!faceOk) {
      this.loading = false;
      this.statusMessage = 'Face not detected. Please take a clearer selfie and try again.';
      return;
    }

    try {
      const pos = await getBestPosition({ timeoutMs: 12000, desiredAccuracyMeters: 60 });
      const latitude = pos.coords.latitude;
      const longitude = pos.coords.longitude;
      const accuracy = typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null;

      this.lastGpsFixAt = new Date();
      this.lastGpsAccuracyMeters = accuracy;
      this.gpsLowAccuracy = accuracy !== null && accuracy > 500;

      this.computeNearest(latitude, longitude);
      if (!this.withinRadius) {
        this.loading = false;
        this.statusMessage = `You are ${this.nearestDistanceMeters}m from ${this.nearestLocationName}. Check-in allowed only at the approved location radius.`;
        return;
      }

      if (!accuracy || accuracy >= 50) {
        this.loading = false;
        this.statusMessage = 'Location not accurate. Please refresh GPS and try again.';
        return;
      }

      this.http
        .post(`${environment.apiUrl}/attendance/checkin/${this.authService.currentUserValue.id}`, {
          latitude,
          longitude,
          gpsAccuracyMeters: accuracy,
          photoBase64,
          faceVerified: faceOk
        })
        .subscribe({
          next: () => {
            this.loading = false;
            this.statusMessage = 'Checked in successfully!';
            this.loadAttendance();
          },
          error: (err) => {
            this.loading = false;
            this.statusMessage = err.error?.error || 'Check-in failed';
          }
        });
    } catch {
      this.loading = false;
      this.statusMessage = 'Location access denied. Please enable GPS.';
    }
  }

  async detectFace(imageDataUrl: string): Promise<boolean> {
    const w: any = window as any;
    if (!w.FaceDetector) return true;
    const detector = new w.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const blob = await (await fetch(imageDataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const faces = await detector.detect(bitmap);
    try {
      bitmap.close();
    } catch {}
    return Array.isArray(faces) && faces.length > 0;
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
    this.statusMessage = 'Please take a selfie to check in.';
  }

  checkOut() {
    if (!this.isGeoAttendanceAllowedDay) {
      this.statusMessage = 'Geo attendance is allowed only from Tuesday to Sunday.';
      return;
    }
    this.loading = true;
    this.statusMessage = 'Verifying location for check-out...';
    getBestPosition({ timeoutMs: 12000, desiredAccuracyMeters: 60 })
      .then((pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        const accuracy = typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null;

        this.lastGpsFixAt = new Date();
        this.lastGpsAccuracyMeters = accuracy;
        this.gpsLowAccuracy = accuracy !== null && accuracy > 500;
        this.computeNearest(latitude, longitude);

        if (!this.withinRadius) {
          this.loading = false;
          this.statusMessage = `You are ${this.nearestDistanceMeters}m from ${this.nearestLocationName}. Check-out allowed only at the approved location radius.`;
          return;
        }

        if (!accuracy || accuracy >= 50) {
          this.loading = false;
          this.statusMessage = 'Location not accurate. Please refresh GPS and try again.';
          return;
        }

        this.http.put(`${environment.apiUrl}/attendance/checkout/${this.authService.currentUserValue.id}`, {
          latitude,
          longitude,
          gpsAccuracyMeters: accuracy
        }).subscribe({
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
      })
      .catch(() => {
        this.loading = false;
        this.statusMessage = 'Location access denied. Please enable GPS.';
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
