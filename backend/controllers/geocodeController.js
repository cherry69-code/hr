const https = require('https');
const asyncHandler = require('../middlewares/asyncHandler');

const getGoogleKey = () =>
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_GEOCODING_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: { 'User-Agent': 'prophr' }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode || 0, body: JSON.parse(data || '{}') });
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });

exports.geocode = asyncHandler(async (req, res) => {
  const query = String(req.query.query || req.query.q || '').trim();
  if (!query || query.length < 3) {
    return res.status(400).json({ success: false, error: 'Please provide a valid query' });
  }
  if (query.length > 200) {
    return res.status(400).json({ success: false, error: 'Query is too long' });
  }

  const key = getGoogleKey();

  if (key) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
    const { statusCode, body } = await fetchJson(url);
    if (statusCode >= 400) {
      return res.status(502).json({ success: false, error: 'Geocoding service error' });
    }

    const status = String(body?.status || '');
    if (status !== 'OK') {
      if (status === 'ZERO_RESULTS') {
        return res.status(404).json({ success: false, error: 'No results found' });
      }
      return res.status(400).json({ success: false, error: body?.error_message || `Geocoding failed: ${status}` });
    }

    const first = body?.results?.[0];
    const loc = first?.geometry?.location;
    if (!loc) {
      return res.status(404).json({ success: false, error: 'No results found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        formattedAddress: String(first?.formatted_address || ''),
        provider: 'google'
      }
    });
  }

  const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const { statusCode, body } = await fetchJson(osmUrl);
  if (statusCode >= 400) {
    return res.status(502).json({ success: false, error: 'Geocoding service error' });
  }
  const first = Array.isArray(body) && body.length ? body[0] : null;
  if (!first) {
    return res.status(404).json({ success: false, error: 'No results found' });
  }
  return res.status(200).json({
    success: true,
    data: {
      lat: Number(first.lat),
      lng: Number(first.lon),
      formattedAddress: String(first.display_name || ''),
      provider: 'nominatim'
    }
  });
});

