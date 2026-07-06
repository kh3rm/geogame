export function toRad(value) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function signalFromDistance(distanceM, radiusM) {
  if (!Number.isFinite(distanceM)) return 0;
  const radius = Math.max(1, radiusM);
  const raw = 1 - Math.min(distanceM, radius * 2.4) / (radius * 2.4);
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'okänt avstånd';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function randomOffsetLatLng(origin, meters = 35) {
  const angle = Math.random() * Math.PI * 2;
  const distance = meters * (0.35 + Math.random() * 0.65);
  const dLat = (distance * Math.cos(angle)) / 111320;
  const dLng = (distance * Math.sin(angle)) / (111320 * Math.cos(toRad(origin.lat)));
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}
