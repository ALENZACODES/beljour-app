/** Short-clip preset negotiations for the existing MediaRecorder reel flow.
 * Full video timelines, trimming and codec transcoding remain out of scope.
 */
import { PALETTE, withAlpha } from "../ui/palette.js";
export const CLIP_PRESETS = Object.freeze({
    quick: { id: "quick", name: "Quick share", width: 540, height: 960, fps: 24,
        maxDurationSeconds: 15, bitrate: 2_500_000, label: true },
    social: { id: "social", name: "Social clip", width: 720, height: 1280, fps: 30,
        maxDurationSeconds: 30, bitrate: 5_000_000, label: true },
    high: { id: "high", name: "High quality clip", width: 1080, height: 1920, fps: 30,
        maxDurationSeconds: 60, bitrate: 8_000_000, label: true },
});
export function resolveClipPreset(id, durationSeconds, isSupported) {
    if (!Object.hasOwn(CLIP_PRESETS, id))
        throw new RangeError("Unknown clip preset");
    const preset = CLIP_PRESETS[id];
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0
        || durationSeconds > preset.maxDurationSeconds) {
        throw new RangeError(`Clip must be at most ${preset.maxDurationSeconds} seconds`);
    }
    const candidates = [
        "video/mp4;codecs=avc1.640028,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm",
    ];
    const mimeType = candidates.find(isSupported);
    if (!mimeType)
        throw new Error("This browser cannot record the supported clip formats");
    const mime = mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm";
    return { ...preset, mime, mimeType, extension: mime === "video/mp4" ? "mp4" : "webm" };
}
/** Draw on top of the final frame rather than relying on source-frame metadata. */
export function drawClipLabel(ctx, width, height, shouldLabel = true) {
    if (!shouldLabel)
        return;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new RangeError("Invalid reel canvas dimensions");
    }
    const size = Math.max(13, Math.round(width / 39));
    const pad = Math.max(8, Math.round(size * 0.5));
    ctx.save();
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const label = "Simulation";
    const boxWidth = ctx.measureText(label).width + pad * 2;
    ctx.fillStyle = withAlpha(PALETTE.plum, 0.85); // burned into the clip: fixed palette
    ctx.fillRect(pad, height - 2 * size - pad, boxWidth, size * 2);
    ctx.fillStyle = PALETTE.cream;
    ctx.fillText(label, pad * 2, height - size * 0.65 - pad);
    ctx.restore();
}
