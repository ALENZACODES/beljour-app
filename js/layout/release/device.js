/** On-device browser probes, never an API or face-quality measurement. Author: John Khan. */
import { PALETTE } from "../../ui/palette.js";
export function readDeviceEnvironment(doc, browser) {
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext("2d");
    const supportsBlob = typeof canvas.toBlob === "function";
    const navigatorLike = browser.navigator;
    const media = typeof browser.matchMedia === "function"
        ? browser.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    return {
        secureContext: browser.isSecureContext === true,
        online: navigatorLike?.onLine !== false,
        reducedMotion: media?.matches === true,
        pixelRatio: Number.isFinite(browser.devicePixelRatio) ? browser.devicePixelRatio : 1,
        canvasAvailable: context !== null,
        encodingAvailable: supportsBlob,
        screenWidth: doc.documentElement?.clientWidth ?? 0,
    };
}
export function quantile(sorted, proportion) {
    if (!sorted.length || !Number.isFinite(proportion) || proportion < 0 || proportion > 1) {
        throw new RangeError("Invalid quantile input");
    }
    const index = (sorted.length - 1) * proportion;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
export function summarizeCanvasSamples(samples) {
    if (samples.length < 3 || samples.length > 20
        || samples.some((value) => !Number.isFinite(value) || value < 0 || value > 300_000)) {
        return {
            status: "invalid", sampleCount: 0, medianMs: null, p95Ms: null,
            elapsedMs: null, label: "drawn-canvas-only",
            note: "Canvas readings were invalid. No performance result is recorded.",
        };
    }
    const sorted = [...samples].sort((left, right) => left - right);
    return {
        status: "measured",
        sampleCount: sorted.length,
        medianMs: Math.round(quantile(sorted, 0.5) * 100) / 100,
        p95Ms: Math.round(quantile(sorted, 0.95) * 100) / 100,
        elapsedMs: Math.round(sorted.reduce((total, value) => total + value, 0) * 100) / 100,
        label: "drawn-canvas-only",
        note: "Measures small synthetic Canvas drawing on this browser only. "
            + "Not a real-photo preview, 12 MP export, 4G first load or physical-phone acceptance.",
    };
}
/** Five bounded synthetic raster operations with disposal in a finally block. */
export function sampleDrawnCanvas(adapter) {
    const canvas = adapter.createCanvas(384, 512);
    const context = canvas.getContext("2d");
    if (!context) {
        canvas.width = 0;
        canvas.height = 0;
        return {
            status: "unavailable", sampleCount: 0, medianMs: null, p95Ms: null,
            elapsedMs: null, label: "drawn-canvas-only",
            note: "Canvas 2D is unavailable. No server processing was attempted.",
        };
    }
    const values = [];
    try {
        for (let sample = 0; sample < 5; sample += 1) {
            const before = adapter.now();
            for (let band = 0; band < 28; band += 1) {
                context.fillStyle = band % 3 === 0 ? PALETTE.plum : band % 3 === 1 ? PALETTE.cream : PALETTE.wine;
                context.fillRect(0, band * 19, 384, 20);
                context.strokeStyle = PALETTE.plum;
                context.strokeRect((sample + band * 3) % 180, (band * 17) % 480, 96, 24);
            }
            const after = adapter.now();
            if (after < before)
                return summarizeCanvasSamples([]);
            values.push(after - before);
        }
        return summarizeCanvasSamples(values);
    }
    catch {
        return summarizeCanvasSamples([]);
    }
    finally {
        canvas.width = 0;
        canvas.height = 0;
    }
}
export function deviceCaveats(environment) {
    const caveats = [];
    if (!environment.secureContext)
        caveats.push("Secure browser context is not confirmed.");
    if (!environment.online)
        caveats.push("This browser reports that it is offline.");
    if (!environment.canvasAvailable)
        caveats.push("Canvas 2D is unavailable.");
    if (!environment.encodingAvailable)
        caveats.push("Canvas Blob encoding is unavailable.");
    if (environment.screenWidth && environment.screenWidth < 320) {
        caveats.push("The viewport is narrower than the minimum mobile review width.");
    }
    return caveats;
}
//# sourceMappingURL=device.js.map