export function normalizeTrackMapImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;

  return String(imageUrl)
    .replace(/\/maps\/albert-park\.png(?=$|[?#])/i, "/maps/albert-park.avif")
    .replace(/\/maps\/singapore\.png(?=$|[?#])/i, "/maps/singapore.avif")
    .replace(
      /\/maps\/(?:silverstone|great-britain)\.png(?=$|[?#])/i,
      "/maps/great-britain.avif"
    );
}
