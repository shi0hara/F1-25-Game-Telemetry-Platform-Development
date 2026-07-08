import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { preprocessImage, postprocessImage } from "./imageProcessor.js";

// Helper to create a small test image as a base64 data URL
async function createTestImage(format = "jpeg") {
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    [format]({ quality: 90 })
    .toBuffer();

  const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

describe("preprocessImage", () => {
  it("should convert a JPEG data URL to JPEG at 85% quality", async () => {
    const input = await createTestImage("jpeg");
    const result = await preprocessImage(input);

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    // Verify it's a valid JPEG by decoding
    const base64 = result.replace("data:image/jpeg;base64,", "");
    const buffer = Buffer.from(base64, "base64");
    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("should convert a PNG data URL to JPEG", async () => {
    const input = await createTestImage("png");
    const result = await preprocessImage(input);

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    const base64 = result.replace("data:image/jpeg;base64,", "");
    const buffer = Buffer.from(base64, "base64");
    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("should convert a WebP data URL to JPEG", async () => {
    const input = await createTestImage("webp");
    const result = await preprocessImage(input);

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    const base64 = result.replace("data:image/jpeg;base64,", "");
    const buffer = Buffer.from(base64, "base64");
    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("should throw INVALID_IMAGE for null input", async () => {
    await expect(preprocessImage(null)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_IMAGE",
    });
  });

  it("should throw INVALID_IMAGE for empty string", async () => {
    await expect(preprocessImage("")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_IMAGE",
    });
  });

  it("should throw INVALID_IMAGE for non-image binary data", async () => {
    const fakeBase64 = "data:image/jpeg;base64," + Buffer.from("not an image at all").toString("base64");
    await expect(preprocessImage(fakeBase64)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_IMAGE",
    });
  });

  it("should throw INVALID_IMAGE for unsupported format (GIF)", async () => {
    // Create a minimal GIF buffer (GIF89a header)
    const gifHeader = Buffer.from("474946383961010001000000002c00000000010001000002024401003b", "hex");
    const dataUrl = "data:image/gif;base64," + gifHeader.toString("base64");
    await expect(preprocessImage(dataUrl)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_IMAGE",
    });
  });

  it("should handle raw base64 without data URL prefix", async () => {
    const buffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const rawBase64 = buffer.toString("base64");
    const result = await preprocessImage(rawBase64);
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe("postprocessImage", () => {
  it("should wrap raw base64 as JPEG data URL", async () => {
    const buffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const rawBase64 = buffer.toString("base64");
    const result = await postprocessImage(rawBase64);

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    const outputBase64 = result.replace("data:image/jpeg;base64,", "");
    const outputBuffer = Buffer.from(outputBase64, "base64");
    const metadata = await sharp(outputBuffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("should handle input that already has data URL prefix", async () => {
    const buffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    const dataUrl = "data:image/png;base64," + buffer.toString("base64");
    const result = await postprocessImage(dataUrl);

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("should throw for null input", async () => {
    await expect(postprocessImage(null)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_IMAGE",
    });
  });

  it("should throw for empty string input", async () => {
    await expect(postprocessImage("")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_IMAGE",
    });
  });
});
