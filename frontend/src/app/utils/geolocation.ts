export type BestPositionOptions = {
  timeoutMs?: number;
  desiredAccuracyMeters?: number;
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
