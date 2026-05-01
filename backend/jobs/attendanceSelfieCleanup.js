const cloudinary = require('../config/cloudinary');
const Attendance = require('../models/Attendance');
const FieldAttendanceLog = require('../models/FieldAttendanceLog');

let timer = null;
let running = false;

const RETENTION_DAYS = 3;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

const cloudinaryPublicIdFromUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const clean = raw.split('?')[0];
    const marker = '/upload/';
    const idx = clean.indexOf(marker);
    if (idx === -1) return '';
    let remainder = clean.slice(idx + marker.length);
    remainder = remainder.replace(/^v\d+\//, '');
    const lastDot = remainder.lastIndexOf('.');
    return lastDot > -1 ? remainder.slice(0, lastDot) : remainder;
  } catch {
    return '';
  }
};

const destroyImage = async (publicId) => {
  const pid = String(publicId || '').trim();
  if (!pid) return false;
  await cloudinary.uploader.destroy(pid, { resource_type: 'image', type: 'private', invalidate: true }).catch(() => null);
  return true;
};

const cutoffDate = () => new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

const cleanupAttendancePhotos = async () => {
  const rows = await Attendance.find({
    createdAt: { $lte: cutoffDate() },
    $or: [{ photoPublicId: { $exists: true, $ne: '' } }, { photoUrl: { $exists: true, $ne: '' } }]
  })
    .select('_id photoPublicId photoUrl')
    .limit(500)
    .lean();

  for (const row of rows || []) {
    const publicId = row.photoPublicId || cloudinaryPublicIdFromUrl(row.photoUrl);
    if (!publicId) continue;
    await destroyImage(publicId);
    await Attendance.updateOne(
      { _id: row._id },
      { $set: { photoUrl: '', photoPublicId: '' } }
    ).catch(() => null);
  }
};

const cleanupFieldPhotos = async () => {
  const rows = await FieldAttendanceLog.find({
    createdAt: { $lte: cutoffDate() },
    $or: [{ imagePublicId: { $exists: true, $ne: '' } }, { imageUrl: { $exists: true, $ne: '' } }]
  })
    .select('_id imagePublicId imageUrl')
    .limit(500)
    .lean();

  for (const row of rows || []) {
    const publicId = row.imagePublicId || cloudinaryPublicIdFromUrl(row.imageUrl);
    if (!publicId) continue;
    await destroyImage(publicId);
    await FieldAttendanceLog.updateOne(
      { _id: row._id },
      { $set: { imageUrl: '', imagePublicId: '' } }
    ).catch(() => null);
  }
};

const tick = async () => {
  if (running) return;
  running = true;
  try {
    await cleanupAttendancePhotos();
    await cleanupFieldPhotos();
  } finally {
    running = false;
  }
};

exports.start = () => {
  if (timer) return;
  tick();
  timer = setInterval(tick, RUN_INTERVAL_MS);
};

exports.stop = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};
