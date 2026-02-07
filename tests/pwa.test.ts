import { buildServiceWorkerUrl, registerServiceWorker } from "../src/pwa";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("pwa registration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds service worker URL from base path", () => {
    expect(buildServiceWorkerUrl("/")).toBe("/sw.js");
    expect(buildServiceWorkerUrl("/pixelscope/")).toBe("/pixelscope/sw.js");
    expect(buildServiceWorkerUrl("/pixelscope")).toBe("/pixelscope/sw.js");
  });

  it("registers service worker immediately when document is already loaded", () => {
    const register = vi.fn(async () => undefined);
    const addEventListener = vi.fn();
    vi.stubGlobal("navigator", {
      serviceWorker: { register },
    } as unknown as Navigator);
    vi.stubGlobal("document", { readyState: "complete" } as Document);
    vi.stubGlobal("window", {
      addEventListener,
    } as unknown as Window & typeof globalThis);

    registerServiceWorker("/pixelscope/");

    expect(register).toHaveBeenCalledWith("/pixelscope/sw.js");
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("defers service worker registration until window load", () => {
    const register = vi.fn(async () => undefined);
    let loadHandler: (() => void) | null = null;
    const addEventListener = vi.fn(
      (eventName: string, listener: (() => void) | EventListenerObject) => {
        if (eventName === "load" && typeof listener === "function") {
          loadHandler = listener;
        }
      },
    );
    vi.stubGlobal("navigator", {
      serviceWorker: { register },
    } as unknown as Navigator);
    vi.stubGlobal("document", { readyState: "loading" } as Document);
    vi.stubGlobal("window", {
      addEventListener,
    } as unknown as Window & typeof globalThis);

    registerServiceWorker("/");
    expect(register).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
      { once: true },
    );

    loadHandler?.();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does not attempt registration when service workers are unavailable", () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("navigator", {} as Navigator);
    vi.stubGlobal("document", { readyState: "complete" } as Document);
    vi.stubGlobal("window", {
      addEventListener,
    } as unknown as Window & typeof globalThis);

    registerServiceWorker("/pixelscope/");

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
