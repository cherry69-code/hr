import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { LocationsPageComponent } from '../locations/locations-page.component';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';
import * as L from 'leaflet';
import {
  GeolocationPermissionState,
  getBestPosition,
  getGeolocationErrorMessage,
  getLocationDeniedInstructions,
  isGeolocationPermissionDenied,
  openBrowserLocationSettings,
  isAndroidChrome,
  isIosSafari,
  triggerNativeLocationPrompt,
  queryLocationPermission,
  watchLocationPermission
} from '../utils/geolocation';
import { getBusinessDateKey, isGeoAttendanceAllowedDay as isGeoAttendanceAllowedToday } from '../utils/businessTime';

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
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
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
  gpsReady = false;
  showLocationPrompt = false;
  locationPermission: GeolocationPermissionState = 'unknown';
  locationPromptMessage = 'PropNinja HR needs your live GPS location for geo punch-in at the office.';
  private locationPromptDismissed = false;
  private lastGpsErrorMessage = '';
  private stopWatchingLocationPermission: (() => void) | null = null;
  private lastKnownPosition: { lat: number; lng: number; accuracy: number | null; at: number } | null = null;
  private readonly maxCheckInAccuracyMeters = 100;
  private readonly gpsCacheMaxAgeMs = 5 * 60 * 1000;
  // Offsite modal
  showOffsite = false;
  // Map instance (Leaflet)
  private map: any;
  private userMarker: any;
  fieldLocationAddress = '';
  pendingFieldAction: 'CHECK_IN' | 'CHECK_OUT' | null = null;
  pendingOfficeAction: 'CHECK_IN' | null = null;
  private officeSelfieProcessing = false;
  showCameraCapture = false;
  cameraBusy = false;
  cameraError = '';
  cameraTarget: 'office' | 'field' | null = null;
  private cameraStream: MediaStream | null = null;
  geoPolicyAllowed: boolean | null = null;
  geoPolicyMessage = '';
  checkInMode: 'office_pin' | 'gps' = 'office_pin';
  selectedLocationId = '';
  officePin = '';
  locationSettingsHint = '';
  private readonly onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    this.loadGeoPolicy();
    void this.syncLocationPermission().then((permission) => {
      if (permission === 'granted' && !this.gpsReady && !this.gpsRefreshing) {
        this.refreshGps(false);
      }
    });
  };

  get isAdmin() {
    return this.role === 'admin';
  }

  get isFieldMode() {
    return false;
  }

  get isGeoAttendanceAllowedDay() {
    if (this.geoPolicyAllowed !== null) return this.geoPolicyAllowed;
    return isGeoAttendanceAllowedToday(new Date());
  }

  get isPinMode() {
    return this.checkInMode === 'office_pin';
  }

  get isGpsMode() {
    return this.checkInMode === 'gps';
  }

  get pinReady() {
    return !!this.selectedLocationId && String(this.officePin || '').trim().length >= 6;
  }

  get checkInDisabled(): boolean {
    if (this.loading || !!this.todayRecord || !this.isGeoAttendanceAllowedDay) return true;
    if (this.isPinMode) return !this.pinReady;
    return !this.gpsReady || !this.withinRadius || this.gpsLowAccuracy;
  }

  get checkOutDisabled(): boolean {
    if (this.loading || !this.todayRecord || !this.isGeoAttendanceAllowedDay) return true;
    if (this.isPinMode || this.todayRecord?.source === 'OFFICE_PIN_WEB') {
      return !this.pinReady;
    }
    return !this.gpsReady || !this.withinRadius || this.gpsLowAccuracy;
  }

  get checkInLabel(): string {
    if (!this.isGeoAttendanceAllowedDay) return 'Available Tue-Sun Only';
    if (this.todayRecord) return 'Checked In';
    if (this.loading) return 'Processing...';
    if (this.isPinMode) {
      if (!this.selectedLocationId) return 'Select Office First';
      if (String(this.officePin || '').trim().length < 6) return 'Enter Office PIN';
      return 'Check In (Selfie)';
    }
    if (!this.gpsReady) return 'Allow Location First';
    if (!this.withinRadius || this.gpsLowAccuracy) return 'Out of Range';
    return 'Check In (Selfie)';
  }

  get showGpsLocationGate(): boolean {
    return this.isGpsMode && !this.gpsReady;
  }

  get isAndroidChromeBrowser(): boolean {
    return isAndroidChrome();
  }

  get checkInButtonClass(): string {
    if (this.todayRecord) return 'bg-gray-400 text-white';
    if (this.isPinMode && this.pinReady) return 'bg-[#16A34A] text-white hover:bg-[#15803d]';
    if (this.withinRadius && !this.gpsLowAccuracy) return 'bg-[#16A34A] text-white hover:bg-[#15803d]';
    return 'bg-yellow-500 text-black hover:bg-yellow-600';
  }

  private isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }

  private get employeeMongoId(): string {
    return this.authService.getMongoUserId();
  }

  /** Mongo id preferred; employee code (e.g. NINJA0020) works on backend too. */
  private get checkInUserParam(): string {
    return this.authService.getMongoUserId() || this.authService.getEmployeeCode();
  }

  private markUiChanged() {
    try {
      this.cdr.detectChanges();
    } catch {}
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
  }

  private setStatus(message: string, isSuccess = false) {
    this.statusMessage = message;
    if (isSuccess) {
      this.toast.success(message);
    } else {
      this.toast.error(message);
    }
  }

  private setInlineStatus(message: string) {
    this.statusMessage = message;
  }

  private get siteHostname(): string {
    if (typeof window === 'undefined') return 'this site';
    return window.location.hostname || 'this site';
  }

  private async syncLocationPermission(): Promise<GeolocationPermissionState> {
    this.locationPermission = await queryLocationPermission();
    return this.locationPermission;
  }

  private startWatchingLocationPermission() {
    if (this.stopWatchingLocationPermission) return;
    this.stopWatchingLocationPermission = watchLocationPermission((state) => {
      this.locationPermission = state;
      if (state === 'granted') {
        this.locationPromptDismissed = false;
        this.lastGpsErrorMessage = '';
        if (!this.gpsRefreshing) {
          this.refreshGps(false);
        }
        return;
      }
      if (state === 'denied') {
        this.gpsReady = false;
        this.applyLocationDeniedState(false);
      }
    });
  }

  private applyLocationDeniedState(userInitiated: boolean) {
    this.locationPromptMessage = getLocationDeniedInstructions(this.siteHostname);
    this.statusMessage = '';
    if (!this.locationPromptDismissed || userInitiated) {
      this.showLocationPrompt = true;
      this.locationPromptDismissed = false;
    }
  }

  private handleGpsFailure(err: unknown, userInitiated: boolean) {
    this.gpsReady = false;
    this.gpsRefreshing = false;
    const msg = getGeolocationErrorMessage(err, this.siteHostname);
    const denied = isGeolocationPermissionDenied(err) || this.locationPermission === 'denied';
    const shouldToast = userInitiated && !denied && msg !== this.lastGpsErrorMessage;
    this.lastGpsErrorMessage = msg;

    if (denied) {
      this.locationPermission = 'denied';
      this.applyLocationDeniedState(userInitiated);
      return;
    }

    this.locationPromptMessage = msg;
    this.statusMessage = '';
    if (!this.locationPromptDismissed || userInitiated) {
      this.showLocationPrompt = true;
      this.locationPromptDismissed = false;
    }
    if (shouldToast) {
      this.toast.error(msg);
    }
  }

  dismissLocationPrompt() {
    this.locationPromptDismissed = true;
    this.showLocationPrompt = false;
    if (
      this.statusMessage.includes('Location is blocked') ||
      this.statusMessage.includes('Unable to get your location') ||
      this.statusMessage.includes('GPS signal')
    ) {
      this.statusMessage = '';
    }
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

  private async ensureJpegDataUrl(file: File): Promise<string> {
    const compressed = await this.compressImage(file).catch(() => '');
    if (!compressed) return '';

    if (/^data:image\/(jpeg|jpg);base64,/.test(compressed)) {
      return compressed;
    }

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load selfie'));
      img.src = compressed;
    });

    const canvas = document.createElement('canvas');
    const width = Math.max(240, Math.min(640, image.width || 640));
    const height = Math.max(320, Math.min(800, image.height || 800));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  private async getCheckInCoordinates(): Promise<{ latitude: number; longitude: number; accuracy: number | null }> {
    const cache = this.lastKnownPosition;
    const cacheFresh = cache && Date.now() - cache.at < this.gpsCacheMaxAgeMs;
    if (cacheFresh && this.withinRadius) {
      return { latitude: cache.lat, longitude: cache.lng, accuracy: cache.accuracy };
    }

    const pos = await getBestPosition({ timeoutMs: 15000, desiredAccuracyMeters: 80 });
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;
    const accuracy = typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null;
    this.lastKnownPosition = { lat: latitude, lng: longitude, accuracy, at: Date.now() };
    this.lastGpsFixAt = new Date();
    this.lastGpsAccuracyMeters = accuracy;
    this.gpsLowAccuracy = accuracy !== null && accuracy > 500;
    this.computeNearest(latitude, longitude);
    return { latitude, longitude, accuracy };
  }

  ngOnInit() {
    if (!this.isAdmin) {
      this.authService.refreshMe().subscribe({
        next: () => this.initEmployeeAttendance(),
        error: () => this.initEmployeeAttendance()
      });
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private initEmployeeAttendance() {
    if (!this.checkInUserParam) {
      this.setStatus('Session error. Please log out and log in again with your employee code or email.');
      return;
    }
    this.loadAttendance();
    this.loadActiveLocations();
    this.loadGeoPolicy();
    if (this.checkInMode === 'gps') {
      this.startWatchingLocationPermission();
    }
  }

  setCheckInMode(mode: 'office_pin' | 'gps') {
    this.checkInMode = mode;
    this.locationSettingsHint = '';
    this.statusMessage = '';
    if (mode === 'office_pin') {
      this.showLocationPrompt = false;
      this.locationPromptDismissed = true;
      return;
    }
    this.locationPromptDismissed = false;
    this.startWatchingLocationPermission();
    void this.beginGpsAccessFlow(true);
  }

  openChromeLocationSettings() {
    const result = openBrowserLocationSettings(this.siteHostname);
    if (result === 'chrome_app') {
      this.locationSettingsHint =
        'Chrome settings opened. Tap Permissions → Location → Allow, then use the back button to return here and tap Try Again.';
    } else if (result === 'location') {
      this.locationSettingsHint = 'Turn on device location, then return and tap Try Again.';
    } else if (result === 'ios_guide') {
      this.locationSettingsHint =
        'Go to iPhone Settings → Safari → Location → Allow, or tap the "aA" icon in the address bar → Website Settings → Location → Allow.';
    } else {
      this.locationSettingsHint =
        'Tap the lock/site icon left of the address bar → Site settings → Location → Allow.';
    }
    this.showLocationPrompt = true;
    this.markUiChanged();
  }

  useOfficePinInstead() {
    this.setCheckInMode('office_pin');
    this.toast.info('Switched to Office PIN — no browser location needed.');
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopWatchingLocationPermission?.();
    this.stopWatchingLocationPermission = null;
    this.stopCameraStream();
  }

  loadGeoPolicy(): Promise<boolean> {
    return firstValueFrom(this.http.get(`${environment.apiUrl}/attendance/geo-policy/today`))
      .then((res: any) => {
        const data = res?.data || {};
        this.geoPolicyAllowed = Boolean(data.allowed);
        this.geoPolicyMessage = String(data.message || '');
        if (this.geoPolicyAllowed) {
          const blockedDayMsg =
            this.statusMessage.includes('Tuesday to Sunday') ||
            this.statusMessage.includes('weekly off') ||
            this.statusMessage.includes('Geo attendance is allowed');
          if (blockedDayMsg) this.statusMessage = '';
        } else {
          this.statusMessage = this.geoPolicyMessage || 'Monday is weekly off. Geo punch is allowed Tuesday to Sunday only.';
        }
        return this.geoPolicyAllowed;
      })
      .catch(() => {
        this.geoPolicyAllowed = isGeoAttendanceAllowedToday(new Date());
        this.geoPolicyMessage = this.geoPolicyAllowed
          ? 'Geo punch is open today (IST). Allowed days: Tuesday to Sunday.'
          : 'Monday is weekly off. Geo punch is allowed Tuesday to Sunday only.';
        return this.geoPolicyAllowed;
      });
  }

  loadAttendance() {
    const userId = this.checkInUserParam;
    if (!userId) {
      this.setStatus('Session expired. Please log out and log in again.');
      return;
    }
    this.http.get(`${environment.apiUrl}/attendance/${userId}`).subscribe({
      next: (res: any) => {
        this.attendanceRecords = res.data || [];
        const today = this.todayRecord;
        if (today?.source === 'OFFICE_PIN_WEB') {
          this.checkInMode = 'office_pin';
          if (today.locationId) {
            this.selectedLocationId = String(today.locationId);
          }
        }
        this.markUiChanged();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to load attendance');
      }
    });
  }

  loadActiveLocations() {
    this.http.get(`${environment.apiUrl}/locations/active`).subscribe({
      next: (res: any) => {
        this.locations = res.data || [];
        if (this.locations.length === 1 && !this.selectedLocationId) {
          this.selectedLocationId = String(this.locations[0]._id);
        }
        setTimeout(() => {
          if (this.gpsReady) {
            this.ensureMap();
          }
          if (this.checkInMode === 'gps') {
            this.bootstrapLocationAccess();
          }
        }, 0);
      }
    });
  }

  private async bootstrapLocationAccess() {
    await this.beginGpsAccessFlow(false);
  }

  allowLocationAccess() {
    void this.beginGpsAccessFlow(true);
  }

  private async beginGpsAccessFlow(userInitiated: boolean) {
    this.locationPromptDismissed = false;
    this.showLocationPrompt = true;
    const permission = await this.syncLocationPermission();

    if (permission === 'granted') {
      this.refreshGps(false);
      return;
    }

    if (permission === 'denied') {
      this.applyLocationDeniedState(userInitiated);
      if (userInitiated) {
        this.openChromeLocationSettings();
      }
      return;
    }

    this.locationPromptMessage = userInitiated
      ? 'Allow location when Chrome asks, or tap Open Chrome Settings if blocked.'
      : 'PropNinja HR needs your live GPS location for geo punch-in at the office.';

    if (userInitiated) {
      this.gpsRefreshing = true;
      try {
        const pos = await triggerNativeLocationPrompt();
        this.gpsRefreshing = false;
        this.applyGpsPosition(pos);
        if (!userInitiated) return;
        this.toast.success('Location enabled');
      } catch (err) {
        this.handleGpsFailure(err, userInitiated);
        if (isGeolocationPermissionDenied(err)) {
          this.openChromeLocationSettings();
        }
      }
      return;
    }

    this.showLocationPrompt = true;
  }

  private applyGpsPosition(pos: GeolocationPosition) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    this.lastGpsFixAt = new Date();
    this.lastGpsAccuracyMeters = typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null;
    this.gpsLowAccuracy = this.lastGpsAccuracyMeters !== null && this.lastGpsAccuracyMeters > 500;
    this.lastKnownPosition = { lat, lng, accuracy: this.lastGpsAccuracyMeters, at: Date.now() };
    this.computeNearest(lat, lng);
    this.gpsReady = true;
    this.locationPermission = 'granted';
    this.showLocationPrompt = false;
    this.locationPromptDismissed = false;
    this.lastGpsErrorMessage = '';
    this.gpsRefreshing = false;
    this.statusMessage = '';
    this.ensureMap(lat, lng);
    this.markUiChanged();
  }

  private ensureMap(lat?: number, lng?: number) {
    if (!this.isGpsMode) return;
    setTimeout(() => {
      this.initMap();
      if (lat !== undefined && lng !== undefined && this.map) {
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
        try {
          this.map.panTo([lat, lng]);
          this.map.invalidateSize();
        } catch {}
      }
    }, 0);
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
  }

  get gpsStatusLabel(): string {
    if (this.gpsRefreshing) return 'Locating…';
    if (!this.gpsReady) return 'Location needed';
    if (this.gpsLowAccuracy) return 'Low Accuracy';
    return this.withinRadius ? 'OK' : 'Out of Range';
  }

  refreshGps(userInitiated: boolean = false) {
    if (!navigator.geolocation) {
      if (userInitiated) this.toast.error('Geolocation is not supported by your browser');
      return;
    }

    if (this.gpsRefreshing) return;

    this.gpsRefreshing = true;
    getBestPosition({ timeoutMs: 12000, desiredAccuracyMeters: 60 })
      .then((pos) => {
        this.applyGpsPosition(pos);
        if (this.gpsLowAccuracy) {
          this.setInlineStatus(
            'GPS accuracy is low. Move closer to a window, disable VPN, then tap Refresh GPS.'
          );
        } else if (userInitiated) {
          this.toast.success('Location enabled');
        }
      })
      .catch((err) => {
        this.handleGpsFailure(err, userInitiated);
        if (userInitiated && isGeolocationPermissionDenied(err)) {
          this.openChromeLocationSettings();
        }
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
    const todayKey = getBusinessDateKey(new Date());
    return this.attendanceRecords.find((r) => getBusinessDateKey(new Date(r.date)) === todayKey);
  }

  onPickFieldSelfie(action: 'CHECK_IN' | 'CHECK_OUT', fileInput: HTMLInputElement) {
    this.pendingFieldAction = action;
    this.openCameraCapture('field', fileInput);
  }

  onOfficeSelfiePickStart(event: Event) {
    if (this.checkInDisabled) {
      event.preventDefault();
      this.explainCheckInBlocked();
      return;
    }
    if (this.isPinMode) {
      if (!this.selectedLocationId) {
        event.preventDefault();
        this.setInlineStatus('Select your office location first.');
        return;
      }
      if (String(this.officePin || '').trim().length < 6) {
        event.preventDefault();
        this.setInlineStatus('Enter the 6-digit office PIN displayed at your office.');
        return;
      }
    }
    if (!this.checkInUserParam) {
      event.preventDefault();
      this.setStatus('Session expired. Please log out and log in again with your employee code.');
      return;
    }
    this.pendingOfficeAction = 'CHECK_IN';
    this.statusMessage = '';
    this.loadGeoPolicy().catch(() => {});
  }

  explainCheckInBlocked() {
    if (!this.checkInUserParam) {
      this.setStatus('Session expired. Please log out and log in again with your employee code.');
      return;
    }
    if (!this.isGeoAttendanceAllowedDay) {
      this.setStatus(this.geoPolicyMessage || 'Monday is weekly off. Geo punch is allowed Tuesday to Sunday only.');
      return;
    }
    if (this.todayRecord) {
      this.setStatus('You have already checked in today.');
      return;
    }
    if (this.isPinMode) {
      if (!this.selectedLocationId) {
        this.setInlineStatus('Select your office location first.');
        return;
      }
      if (String(this.officePin || '').trim().length < 6) {
        this.setInlineStatus('Enter the 6-digit office PIN displayed at your office.');
        return;
      }
      return;
    }
    if (!this.gpsReady) {
      this.locationPromptDismissed = false;
      if (this.locationPermission === 'denied') {
        this.applyLocationDeniedState(true);
      } else {
        this.showLocationPrompt = true;
        this.locationPromptMessage = 'Allow location first to check in.';
      }
      return;
    }
    if (this.gpsLowAccuracy) {
      this.setStatus('GPS accuracy is low. Tap Refresh GPS, then try again.');
      return;
    }
    if (!this.withinRadius) {
      this.setStatus(
        `You are ${this.nearestDistanceMeters ?? '-'}m from ${this.nearestLocationName || 'the office'}. Move closer to check in.`
      );
      return;
    }
    if (this.loading) {
      this.toast.info('Check-in is already in progress.');
    }
  }

  private triggerSelfieFileInput(fileInput: HTMLInputElement) {
    try {
      fileInput.value = '';
      fileInput.click();
    } catch {
      this.setStatus('Unable to open camera. Please allow camera permission and try again.');
    }
  }

  private canUseCameraCapture(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private openCameraCapture(target: 'office' | 'field', fallbackInput: HTMLInputElement) {
    if (!this.canUseCameraCapture()) {
      this.triggerSelfieFileInput(fallbackInput);
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
      this.triggerSelfieFileInput(fallbackInput);
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
      await this.handleOfficeSelfieFile(file, 'CHECK_IN');
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

  onOfficeSelfieSelected(evt: Event) {
    if (this.officeSelfieProcessing || this.loading) return;
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    input.value = '';
    if (!file) return;

    this.officeSelfieProcessing = true;
    this.zone.run(() => {
      void this.processOfficeSelfieFile(file).finally(() => {
        this.officeSelfieProcessing = false;
      });
    });
  }

  private async processOfficeSelfieFile(file: File) {
    try {
      await this.handleOfficeSelfieFile(file, 'CHECK_IN');
    } catch (err: any) {
      this.loading = false;
      this.setStatus(err?.message || 'Check-in failed. Please try again.');
      this.markUiChanged();
    }
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

  private async handleOfficeSelfieFile(file: File, action: 'CHECK_IN' = 'CHECK_IN') {
    this.pendingOfficeAction = null;
    if (!file) {
      this.setStatus('Selfie not captured. Please try again.');
      return;
    }
    if (action !== 'CHECK_IN') return;

    if (!this.isGeoAttendanceAllowedDay) {
      this.setStatus(this.geoPolicyMessage || 'Monday is weekly off. Geo punch is allowed Tuesday to Sunday only.');
      return;
    }
    if (this.todayRecord) {
      this.setStatus('You have already checked in today.');
      return;
    }

    const employeeParam = this.checkInUserParam;
    if (!employeeParam) {
      this.setStatus('Session expired. Please log out and log in again with your employee code.');
      return;
    }

    this.loading = true;
    this.statusMessage = 'Processing selfie...';
    this.markUiChanged();

    let photoBase64 = '';
    try {
      photoBase64 = await this.withTimeout(
        this.ensureJpegDataUrl(file),
        45000,
        'Selfie processing took too long. Please retake with a smaller photo.'
      );
    } catch (err: any) {
      this.loading = false;
      this.setStatus(err?.message || 'Selfie capture failed. Please retake the photo.');
      this.markUiChanged();
      return;
    }
    if (!photoBase64) {
      this.loading = false;
      this.setStatus('Selfie capture failed. Please retake the photo.');
      this.markUiChanged();
      return;
    }

    this.statusMessage = 'Submitting check-in...';
    this.markUiChanged();

    const faceOk = this.isMobileDevice()
      ? true
      : await this.detectFace(photoBase64).catch(() => true);
    if (!faceOk) {
      this.loading = false;
      this.setStatus('Face not detected. Please take a clearer selfie and try again.');
      this.markUiChanged();
      return;
    }

    try {
      if (this.isPinMode) {
        await firstValueFrom(
          this.http
            .post(`${environment.apiUrl}/attendance/checkin/${employeeParam}`, {
              checkInMode: 'office_pin',
              selectedLocationId: this.selectedLocationId,
              officePin: String(this.officePin || '').trim(),
              photoBase64,
              faceVerified: faceOk
            })
            .pipe(timeout(90000))
        );
      } else {
        const { latitude, longitude, accuracy } = await this.withTimeout(
          this.getCheckInCoordinates(),
          20000,
          'Could not read GPS for check-in. Switch to Office PIN check-in if location is blocked.'
        );

        if (!this.withinRadius) {
          this.loading = false;
          this.setStatus(
            `You are ${this.nearestDistanceMeters}m from ${this.nearestLocationName}. Check-in allowed only at the approved location radius.`
          );
          this.markUiChanged();
          return;
        }

        if (accuracy !== null && accuracy > this.maxCheckInAccuracyMeters) {
          this.loading = false;
          this.setStatus(`GPS accuracy is ${accuracy}m. Move closer to the office or tap Refresh GPS, then try again.`);
          this.markUiChanged();
          return;
        }

        await firstValueFrom(
          this.http
            .post(`${environment.apiUrl}/attendance/checkin/${employeeParam}`, {
              latitude,
              longitude,
              gpsAccuracyMeters: accuracy,
              photoBase64,
              faceVerified: faceOk
            })
            .pipe(timeout(90000))
        );
      }

      this.loading = false;
      this.statusMessage = 'Checked in successfully!';
      this.toast.success('Checked in successfully!');
      await this.authService.refreshMe().toPromise().catch(() => {});
      this.loadAttendance();
      this.markUiChanged();
    } catch (err: any) {
      this.loading = false;
      if (isGeolocationPermissionDenied(err)) {
        this.handleGpsFailure(err, true);
        this.markUiChanged();
        return;
      }
      const apiMsg = err?.error?.error;
      const geoMsg = getGeolocationErrorMessage(err, this.siteHostname);
      const timeoutMsg = String(err?.name || '').includes('Timeout') ? 'Check-in timed out. Please try again on better network.' : '';
      const message = apiMsg || geoMsg || timeoutMsg || err?.message || 'Check-in failed. Please try again.';
      if (geoMsg && !apiMsg) {
        this.setInlineStatus(message);
      } else {
        this.setStatus(message);
      }
      this.markUiChanged();
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

        if (accuracy !== null && accuracy > this.maxCheckInAccuracyMeters) {
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

  async checkOut() {
    const employeeId = this.checkInUserParam;
    if (!employeeId) {
      this.setStatus('Session expired. Please log out and log in again.');
      return;
    }

    const allowed = await this.loadGeoPolicy();
    if (!allowed) {
      this.setStatus(this.geoPolicyMessage || 'Monday is weekly off. Geo punch is allowed Tuesday to Sunday only.');
      return;
    }

    const usePin =
      this.isPinMode || String(this.todayRecord?.source || '') === 'OFFICE_PIN_WEB';
    if (usePin) {
      if (!this.selectedLocationId || String(this.officePin || '').trim().length < 6) {
        this.setInlineStatus('Select office and enter today\'s 6-digit PIN to check out.');
        return;
      }
      this.loading = true;
      this.statusMessage = 'Submitting check-out...';
      this.http
        .put(`${environment.apiUrl}/attendance/checkout/${employeeId}`, {
          checkInMode: 'office_pin',
          selectedLocationId: this.selectedLocationId,
          officePin: String(this.officePin || '').trim()
        })
        .subscribe({
          next: () => {
            this.loading = false;
            this.statusMessage = 'Checked out successfully!';
            this.toast.success('Checked out successfully!');
            this.loadAttendance();
          },
          error: (err) => {
            this.loading = false;
            this.setStatus(err.error?.error || 'Check-out failed');
          }
        });
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

        if (accuracy !== null && accuracy > this.maxCheckInAccuracyMeters) {
          this.loading = false;
          this.statusMessage = 'Location not accurate. Please refresh GPS and try again.';
          return;
        }

        this.http.put(`${environment.apiUrl}/attendance/checkout/${employeeId}`, {
          latitude,
          longitude,
          gpsAccuracyMeters: accuracy
        }).subscribe({
          next: () => {
            this.loading = false;
            this.statusMessage = 'Checked out successfully!';
            this.toast.success('Checked out successfully!');
            this.loadAttendance();
          },
          error: (err) => {
            this.loading = false;
            this.setStatus(err.error?.error || 'Check-out failed');
          }
        });
      })
      .catch((err) => {
        this.loading = false;
        if (isGeolocationPermissionDenied(err)) {
          this.handleGpsFailure(err, true);
          return;
        }
        this.setInlineStatus(getGeolocationErrorMessage(err, this.siteHostname));
      });
  }

  checkOutAt(latitude: number, longitude: number) {
    this.http.put(`${environment.apiUrl}/attendance/checkout/${this.employeeMongoId}`, { latitude, longitude }).subscribe({
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
