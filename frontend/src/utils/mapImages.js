const TRACK_MAP_IMAGES = {
  track_0: "/maps/albert-park.avif",
  track_7: "/maps/great-britain.avif",
  track_12: "/maps/singapore.avif",
};

function isPlaceholderMapImage(imageUrl) {
  return /\/maps\/(?:default-track\.png|placeholder)(?=$|[?#])/i.test(
    String(imageUrl || "")
  );
}

export function normalizeTrackMapImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;

  const url = String(imageUrl).trim().replace(/\\/g, "/");
  const normalizedUrl = /^maps\//i.test(url) ? `/${url}` : url;

  return normalizedUrl
    .replace(/\/maps\/albert-park\.png(?=$|[?#])/i, "/maps/albert-park.avif")
    .replace(/\/maps\/singapore\.png(?=$|[?#])/i, "/maps/singapore.avif")
    .replace(
      /\/maps\/(?:silverstone|great-britain)\.png(?=$|[?#])/i,
      "/maps/great-britain.avif"
    );
}

export function getDefaultTrackMapImage(trackKey) {
  return TRACK_MAP_IMAGES[String(trackKey || "")] || null;
}

export function resolveTrackMapImageUrl(imageUrl, trackKey, fallbackUrl) {
  const trackDefault = normalizeTrackMapImageUrl(getDefaultTrackMapImage(trackKey));
  const fallbackCandidate = normalizeTrackMapImageUrl(fallbackUrl);
  const fallback =
    fallbackCandidate && !isPlaceholderMapImage(fallbackCandidate)
      ? fallbackCandidate
      : trackDefault;
  const normalized = normalizeTrackMapImageUrl(imageUrl);

  if (isPlaceholderMapImage(normalized)) {
    return fallback || null;
  }

  return normalized || fallback;
}
