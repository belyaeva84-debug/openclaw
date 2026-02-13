import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetch-timeout.js";

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return the response when fetch resolves before timeout", async () => {
    const mockResponse = new Response("OK", { status: 200 });
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);

    const promise = fetchWithTimeout("https://example.com", {}, 1000, mockFetch);

    // Advance time slightly to simulate work, but less than timeout
    vi.advanceTimersByTime(500);

    await expect(promise).resolves.toBe(mockResponse);
  });

  it("should throw AbortError when fetch times out", async () => {
    const mockFetch = vi.fn((url, init) => {
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException("The operation was aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    const promise = fetchWithTimeout("https://example.com", {}, 1000, mockFetch);

    // Advance beyond timeout
    vi.advanceTimersByTime(1100);

    await expect(promise).rejects.toThrow("The operation was aborted");
    await expect(promise).rejects.toHaveProperty("name", "AbortError");
  });

  it("should propagate errors from fetch", async () => {
    const mockError = new Error("Network error");
    const mockFetch = vi.fn().mockRejectedValue(mockError);

    const promise = fetchWithTimeout("https://example.com", {}, 1000, mockFetch);

    await expect(promise).rejects.toThrow(mockError);
  });

  it("should pass the correct parameters to the fetch function", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("OK"));
    const init = { method: "POST", body: "data" };

    await fetchWithTimeout("https://example.com", init, 1000, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        ...init,
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("should handle 0 or negative timeout by enforcing at least 1ms", async () => {
    const mockFetch = vi.fn((url, init) => {
       return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    // Pass 0 as timeout
    const promise = fetchWithTimeout("https://example.com", {}, 0, mockFetch);

    // Advance by 1ms (minimum timeout)
    vi.advanceTimersByTime(1);

    await expect(promise).rejects.toThrow("The operation was aborted");
  });
});
