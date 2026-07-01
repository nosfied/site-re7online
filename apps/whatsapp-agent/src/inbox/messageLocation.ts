export type InboxMessageLocation = {
  latitude: number;
  longitude: number;
  name: string | null;
  address: string | null;
  googleMapsUrl: string;
  openStreetMapUrl: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function buildLocationUrls(latitude: number, longitude: number) {
  const coords = `${latitude},${longitude}`;
  return {
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`,
    openStreetMapUrl: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(
      String(latitude)
    )}&mlon=${encodeURIComponent(String(longitude))}#map=18/${encodeURIComponent(
      String(latitude)
    )}/${encodeURIComponent(String(longitude))}`,
  };
}

export function extractMessageLocation(rawPayload: unknown): InboxMessageLocation | null {
  const root = asRecord(rawPayload);
  const location = asRecord(root?.location);
  if (!location) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    name: normalizeOptionalText(location.name, 160),
    address: normalizeOptionalText(location.address, 300),
    ...buildLocationUrls(latitude, longitude),
  };
}

export function formatMessageLocationText(location: InboxMessageLocation | null) {
  if (!location) return "Localizacao compartilhada";
  const title = location.name || "Localizacao compartilhada";
  const address = location.address ? ` - ${location.address}` : "";
  return `${title}${address} (${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})`;
}
