export type BestPositionOptions = {
  timeoutMs?: number;
  desiredAccuracyMeters?: number;
};

export type GeolocationPermissionState = PermissionState | 'unknown';

export const isGeolocationPermissionDenied = (err: unknown): boolean => {
  const code = Number((err as GeolocationPositionError)?.code);
  if (code === 1) return true;
  const message = String((err as Error)?.message || '').toLowerCase();
  return message.includes('denied') || message.includes('permission');
};

export const getLocationDeniedInstructions = (hostname: string = 'this site'): string => {
  return `Location is blocked for ${hostname}. Tap "Open Chrome Settings" below, set Location to Allow, then return and tap Try Again.`;
};

export const isAndroidChrome = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg|OPR|SamsungBrowser/i.test(ua);
};

export const isIosSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
};

/** Best-effort: open device/browser settings. Site permission cannot be granted fully automatically from web. */
export const openBrowserLocationSettings = (hostname?: string): 'chrome_app' | 'location' | 'ios_guide' | 'unsupported' => {
  if (typeof window === 'undefined') return 'unsupported';
  const host = hostname || window.location.hostname || 'this site';

  if (isAndroidChrome()) {
    const chromeAppIntent =
      'intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;scheme=package;package=com.android.chrome;end';
    const locationIntent = 'intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end';
    try {
      window.location.href = chromeAppIntent;
      return 'chrome_app';
    } catch {
      try {
        window.location.assign(locationIntent);
        return 'location';
      } catch {
        return 'unsupported';
      }
    }
  }

  if (isIosSafari()) {
    return 'ios_guide';
  }

  void host;
  return 'unsupported';
};

export const triggerNativeLocationPrompt = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    });
  });
};

export const getGeolocationErrorMessage = (err: unknown, hostname: string = 'hrpropninja.com'): string => {
  const code = Number((err as GeolocationPositionError)?.code);
  if (code === 1 || isGeolocationPermissionDenied(err)) {
    return getLocationDeniedInstructions(hostname);
  }
  if (code === 2) {
    return 'GPS signal not found. Turn on device location, move near a window, then tap Try Again.';
  }
  if (code === 3) {
    return 'Location request timed out. Tap Try Again.';
  }
  return 'Unable to get your location. Turn on device GPS and allow location for this site.';
};

export const queryLocationPermission = async (): Promise<GeolocationPermissionState> => {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return result.state;
  } catch {
    return 'unknown';
  }
};

export const watchLocationPermission = (
  onChange: (state: GeolocationPermissionState) => void
): (() => void) => {
  if (!navigator.permissions?.query) return () => {};
  let disposed = false;
  let status: PermissionStatus | null = null;

  const handler = () => {
    if (!disposed && status) onChange(status.state);
  };

  navigator.permissions
    .query({ name: 'geolocation' as PermissionName })
    .then((result) => {
      if (disposed) return;
      status = result;
      result.addEventListener('change', handler);
      onChange(result.state);
    })
    .catch(() => {});

  return () => {
    disposed = true;
    if (status) {
      try {
        status.removeEventListener('change', handler);
      } catch {}
    }
  };
};

export const getBestPosition = (options: BestPositionOptions = {}): Promise<GeolocationPosition> => {
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 9000;
  const desiredAccuracyMeters =
    typeof options.desiredAccuracyMeters === 'number' ? options.desiredAccuracyMeters : 60;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    let best: GeolocationPosition | null = null;
    let done = false;
    let watchId: number | null = null;

    const finish = (pos?: GeolocationPosition, err?: any) => {
      if (done) return;
      done = true;
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {}
      }
      if (pos) resolve(pos);
      else reject(err || new Error('Unable to get location'));
    };

    const timer = setTimeout(() => {
      if (best) finish(best);
      else finish(undefined, new Error('Location timeout'));
    }, timeoutMs);

    const onPos = (pos: GeolocationPosition) => {
      const acc = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : Number.POSITIVE_INFINITY;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (Math.abs(lat) < 0.00001 && Math.abs(lng) < 0.00001) return;

      const bestAcc = best && typeof best.coords.accuracy === 'number' ? best.coords.accuracy : Number.POSITIVE_INFINITY;
      if (!best || acc < bestAcc) {
        best = pos;
      }
      if (acc <= desiredAccuracyMeters) {
        clearTimeout(timer);
        finish(pos);
      }
    };

    const onErr = (e: any) => {
      clearTimeout(timer);
      if (best) finish(best);
      else finish(undefined, e);
    };

    try {
      watchId = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs
      });
    } catch (e) {
      clearTimeout(timer);
      finish(undefined, e);
    }
  });
};
