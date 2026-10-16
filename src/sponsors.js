// Pure helpers for sponsors: validation, what the app receives, and day keys.

const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const isActiveNow = (sponsor, now = new Date()) =>
  !!sponsor.active && new Date(sponsor.startDate) <= now && now <= new Date(sponsor.endDate);

const cleanList = (value) =>
  (Array.isArray(value) ? value : [])
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 500);

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

// Image comes from the admin page as a data URL: "data:image/png;base64,...."
const parseImage = (dataUrl) => {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) return { error: 'Image must be PNG, JPG or WEBP' };
  const data = Buffer.from(match[2], 'base64');
  if (data.length > MAX_IMAGE_BYTES) return { error: 'Image is larger than 1 MB' };
  return { image: { data, contentType: match[1] } };
};

// Validates the admin form. partial=true for updates (only the sent fields).
const validateSponsorInput = (body, { partial = false } = {}) => {
  const errors = [];
  const value = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const text = (key, max, required) => {
    if (!has(key)) {
      if (required && !partial) errors.push(`${key} is required`);
      return;
    }
    const v = String(body[key] ?? '').trim();
    if (required && !v) errors.push(`${key} is required`);
    else if (v.length > max) errors.push(`${key} is too long (max ${max})`);
    else value[key] = v;
  };

  if (has('app') || !partial) {
    if (!['il', 'us'].includes(body.app)) errors.push('app must be "il" or "us"');
    else value.app = body.app;
  }
  text('advertiser', 80, true);
  text('title', 60, true);
  text('text', 140, false);
  text('ctaLabel', 30, false);
  if (has('linkUrl') || !partial) {
    if (!isHttpUrl(body.linkUrl)) errors.push('linkUrl must start with https://');
    else value.linkUrl = String(body.linkUrl).trim();
  }
  if (has('allSpots')) value.allSpots = !!body.allSpots;
  if (has('regions')) value.regions = cleanList(body.regions);
  if (has('spotIds')) value.spotIds = cleanList(body.spotIds);
  if (has('active')) value.active = !!body.active;
  if (has('priority')) value.priority = Math.max(0, Math.min(100, Number(body.priority) || 0));
  for (const key of ['startDate', 'endDate']) {
    if (has(key) || !partial) {
      const d = new Date(body[key]);
      if (Number.isNaN(d.getTime())) errors.push(`${key} is not a valid date`);
      else value[key] = d;
    }
  }
  if (value.startDate && value.endDate && value.endDate < value.startDate) errors.push('endDate is before startDate');
  if (!partial && !value.allSpots && !(value.regions || []).length && !(value.spotIds || []).length) {
    errors.push('Choose where to show it: all spots, regions or spots');
  }
  if (has('image') && body.image) {
    const parsed = parseImage(body.image);
    if (parsed.error) errors.push(parsed.error);
    else value.image = parsed.image;
  }
  return { value, errors };
};

// What the app gets: no internal fields, image as a cacheable URL
const toPublic = (sponsor, baseUrl) => ({
  id: String(sponsor._id),
  title: sponsor.title,
  text: sponsor.text || '',
  ctaLabel: sponsor.ctaLabel || '',
  linkUrl: sponsor.linkUrl,
  imageUrl: sponsor.image && sponsor.image.contentType
    ? `${baseUrl}/api/sponsors/${sponsor._id}/image?v=${sponsor.imageVersion || 0}`
    : null,
  allSpots: !!sponsor.allSpots,
  regions: sponsor.regions || [],
  spotIds: sponsor.spotIds || [],
  priority: sponsor.priority || 0,
  endDate: sponsor.endDate,
});

// For the admin list: everything except the image bytes
const toAdmin = (sponsor) => {
  const plain = typeof sponsor.toObject === 'function' ? sponsor.toObject() : { ...sponsor };
  const hasImage = !!(plain.image && plain.image.contentType);
  delete plain.image;
  return { ...plain, id: String(plain._id), hasImage };
};

module.exports = { dayKey, isActiveNow, isHttpUrl, parseImage, validateSponsorInput, toPublic, toAdmin, MAX_IMAGE_BYTES, IMAGE_TYPES };
