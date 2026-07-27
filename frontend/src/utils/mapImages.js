const DEFAULT_TRACK_MAP_IMAGE = "/maps/albert-park.avif";

const TRACK_MAP_IMAGES = {
  track_0: "/maps/albert-park.avif",
  track_7: "/maps/great-britain.avif",
  track_12: "/maps/singapore.avif",
};

export function normalizeTrackMapImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;

  const url = String(imageUrl).trim().replace(/\\/g, "/");
  const normalizedUrl = /^maps\//i.test(url) ? `/${url}` : url;

  return normalizedUrl
    .replace(/\/maps\/default-track\.png(?=$|[?#])/i, DEFAULT_TRACK_MAP_IMAGE)
    .replace(/\/maps\/placeholder(?=$|[?#])/i, DEFAULT_TRACK_MAP_IMAGE)
    .replace(/\/maps\/albert-park\.png(?=$|[?#])/i, "/maps/albert-park.avif")
    .replace(/\/maps\/singapore\.png(?=$|[?#])/i, "/maps/singapore.avif")
    .replace(
      /\/maps\/(?:silverstone|great-britain)\.png(?=$|[?#])/i,
      "/maps/great-britain.avif"
    );
}

export function getDefaultTrackMapImage(trackKey) {
  return TRACK_MAP_IMAGES[String(trackKey || "")] || DEFAULT_TRACK_MAP_IMAGE;
}

export function resolveTrackMapImageUrl(imageUrl, trackKey, fallbackUrl) {
  const fallback = normalizeTrackMapImageUrl(
    fallbackUrl || getDefaultTrackMapImage(trackKey)
  );
  const normalized = normalizeTrackMapImageUrl(imageUrl);

  return normalized || fallback;
}
