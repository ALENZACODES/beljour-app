import { ClipJob, ClipJobError } from "../reel/clip-jobs.js";
export const FPS = 30;
export const SECONDS = 4; // ASSUMED: long enough to read, short enough to share
export const HOLD = 0.8; // seconds the before and the after each hold still; ASSUMED
export const DIVIDER = 3; // divider width in pixels
export const MIMES = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
export class VideoRefused extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** Share of the width already showing the edit at frame `i` of `frames`. */
export function wipeAt(i, frames = FPS * SECONDS) {
    const t = i / FPS, move = SECONDS - 2 * HOLD;
    if (frames < 1 || i < 0 || i >= frames)
        throw new RangeError("frame out of range");
    return Math.min(1, Math.max(0, (t - HOLD) / move));
}
function rgbaAt(img, p, out, o) {
    const c = img.channels;
    out[o] = img.data[p * c];
    out[o + 1] = img.data[p * c + 1];
    out[o + 2] = img.data[p * c + 2];
    out[o + 3] = c === 4 ? img.data[p * c + 3] : 255;
}
/** One frame: the edit left of the divider, the original right of it, a white divider between. */
export function composeFrame(before, after, share) {
    if (before.width !== after.width || before.height !== after.height)
        throw new VideoRefused("size_mismatch", "The original and the edit must be the same size.");
    if (![3, 4].includes(before.channels) || ![3, 4].includes(after.channels))
        throw new VideoRefused("bad_photo", "A clip needs RGB or RGBA images.");
    const { width: w, height: h } = before;
    const edge = Math.round(share * w);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const p = y * w + x, o = p * 4;
            if (share > 0 && share < 1 && Math.abs(x - edge) < DIVIDER / 2 + 0.5) {
                out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255;
                continue;
            }
            rgbaAt(x < edge ? after : before, p, out, o);
        }
    return out;
}
/** Text drawn on each frame; system fonts only, no font file is loaded. */
export function frameLabels(share, simulationLabel, isSimulation) {
    const out = [];
    if (share > 0)
        out.push({ text: simulationLabel && isSimulation ? "After · Simulation" : "After", side: "left" });
    if (share < 1)
        out.push({ text: "Before", side: "right" });
    return out;
}
export async function recordBeforeAfter(before, after, deps, options) {
    composeFrame(before, after, 0);
    const mime = MIMES.find((m) => deps.supported(m));
    const canvas = deps.canvas(before.width, before.height);
    const ctx = canvas.getContext("2d");
    if (!mime || !ctx || typeof canvas.captureStream !== "function") {
        throw new VideoRefused("no_recorder", "This browser can't record a video of the canvas. Save the compare image instead.");
    }
    const job = new ClipJob(canvas.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 4_000_000,
        makeRecorder: deps.makeRecorder, signal: deps.signal, maxBufferedBytes: 32 * 1024 * 1024 });
    const frames = FPS * SECONDS;
    const size = Math.max(12, Math.round(before.height / 24));
    ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    try {
        job.start();
        for (let i = 0; i < frames; i++) {
            if (deps.signal?.aborted)
                throw new VideoRefused("stopped", "Recording stopped. Nothing was saved.");
            const share = wipeAt(i, frames);
            ctx.putImageData(deps.imageData(composeFrame(before, after, share), before.width, before.height), 0, 0);
            ctx.fillStyle = "#ffffff";
            for (const l of frameLabels(share, options.simulationLabel, options.isSimulation)) {
                ctx.fillText(l.text, l.side === "left" ? size * 0.6 : before.width - size * (0.6 + l.text.length * 0.55), size * 1.4);
            }
            await deps.tick();
        }
        const blob = await job.finish();
        return { blob, mime, frames, seconds: SECONDS, width: before.width, height: before.height,
            label: options.simulationLabel && options.isSimulation ? "Simulation" : null };
    }
    catch (error) {
        job.dispose();
        if (error instanceof ClipJobError)
            throw new VideoRefused("recording_failed", `Recording stopped: ${error.message}.`);
        throw error;
    }
}
