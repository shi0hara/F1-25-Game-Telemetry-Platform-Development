import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyAuth } from "./auth.js";

// Mock firebase-admin/auth
vi.mock("firebase-admin/auth", () => {
  const mockVerifyIdToken = vi.fn();
  return {
    getAuth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
    __mockVerifyIdToken: mockVerifyIdToken,
  };
});

// Access the mock
import { __mockVerifyIdToken as mockVerifyIdToken } from "firebase-admin/auth";

describe("verifyAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return decoded token on valid Bearer token", async () => {
    const decodedToken = { uid: "user-123", email: "test@example.com" };
    mockVerifyIdToken.mockResolvedValue(decodedToken);

    const req = {
      headers: { authorization: "Bearer valid-token-abc" },
    };

    const result = await verifyAuth(req);

    expect(result).toEqual(decodedToken);
    expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-token-abc");
  });

  it("should throw 401 when Authorization header is missing", async () => {
    const req = { headers: {} };

    await expect(verifyAuth(req)).rejects.toEqual({
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    });
  });

  it("should throw 401 when Authorization header does not start with Bearer", async () => {
    const req = {
      headers: { authorization: "Basic some-credentials" },
    };

    await expect(verifyAuth(req)).rejects.toEqual({
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    });
  });

  it("should throw 401 when Bearer token is empty", async () => {
    const req = {
      headers: { authorization: "Bearer " },
    };

    await expect(verifyAuth(req)).rejects.toEqual({
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    });
  });

  it("should throw 401 with expired message for expired tokens", async () => {
    mockVerifyIdToken.mockRejectedValue({ code: "auth/id-token-expired" });

    const req = {
      headers: { authorization: "Bearer expired-token" },
    };

    await expect(verifyAuth(req)).rejects.toEqual({
      status: 401,
      code: "AUTH_FAILED",
      message: "Session expired. Please sign in again.",
    });
  });

  it("should throw 401 for malformed/invalid tokens", async () => {
    mockVerifyIdToken.mockRejectedValue({ code: "auth/argument-error" });

    const req = {
      headers: { authorization: "Bearer malformed-token" },
    };

    await expect(verifyAuth(req)).rejects.toEqual({
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    });
  });

  it("should throw 401 for revoked tokens", async () => {
    mockVerifyIdToken.mockRejectedValue({ code: "auth/id-token-revoked" });

    const req = {
      headers: { authorization: "Bearer revoked-token" },
    };

    await expect(verifyAuth(req)).rejects.toEqual({
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication required. Please sign in again.",
    });
  });
});
