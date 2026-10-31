/** Photo pre-check: plain measurements of a photo before it is used, and before anything is sent.
 *
 * Runs in the shell worker (shell-worker.ts) on the device; nothing leaves the browser. It reuses
 * R7's own estimators (spikes/enhance.ts analyse: wavelet-MAD noise, re-blur blur sigma,
 * exposure, grey-world cast) on a copy no larger than 512 px (blockiness at full size, on the
 * file's own pixel grid), and adds size, shape,
 * blank-image and file checks. When a recorded face fixture is present (drawn samples only; no
 * face model runs in this editor) it also runs the classic screen's framing checks.
 *
 * Levels: "pass", "warn" (you can continue, results may be weaker) and "block" (this photo can't
 * be used for that purpose). Thresholds are ASSUMED until John's released photos set them
 * (plan §9), and every one is listed in PRECHECK_LIMITS so the UI can show it.
 *
 * Face-mapping credits (licences.json "concepts"): runtime MediaPipe Face Landmarker (Bucket A)
 * mesh indices, only on a recorded fixture and through face/quality.ts; concept only, no code
 * copied: OpenFace (pose and framing checks before analysis), from its documentation.
 *
 * Author: John Khan.
 */
import { requireColour, resize } from "../../engines/core/buffer.js";
import { analyse, blockiness, luma255 } from "../../engines/local/enhance.js";
import { runChecks } from "../../face/quality.js";
import { asRGB } from "./compare.js";
export const PRECHECK_VERSION = "beljour-precheck/1";
/** ASSUMED cut points; recorded in the report so a change is visible. */
export const PRECHECK_LIMITS = Object.freeze({
    analysisSide: 512,
    minSideLocal: 64,
    minSideStyling: 320,
    smallSide: 512,
    maxAspect: 3,
    evWarn: 1.5,
    clippedBrightWarn: 0.08,
    clippedDarkWarn: 0.2,
    blurWarn: 2.5,
    /** Motion blur reads lower on the re-blur estimate, so shake warns sooner. */
    motionWarn: 1.4,
    noiseWarn: 8,
    castWarn: 12,
    blockWarn: 0.15,
    blankStd: 2,
    maxBytes: 15 * 1024 * 1024,
});
function lumaStd(img) {
    const n = img.width * img.height;
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) {
        const y = 0.2126 * img.data[i * img.channels] + 0.7152 * img.data[i * img.channels + 1] + 0.0722 * img.data[i * img.channels + 2];
        sum += y;
        sq += y * y;
    }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
}
const pass = (id, title, message, value) => ({ id, level: "pass", title, message, value });
const warn = (id, title, message, value) => ({ id, level: "warn", title, message, value });
const block = (id, title, message, value) => ({ id, level: "block", title, message, value });
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
export function fileCheck(file) {
    if (!file)
        return null;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type))
        return block("file", "File type", "Use a JPEG, PNG or WebP photo.", file.type || "unknown");
    if (!(Number.isFinite(file.bytes) && file.bytes > 0))
        return block("file", "File size", "The file is empty.", file.bytes);
    if (file.bytes > PRECHECK_LIMITS.maxBytes)
        return block("file", "File size", "Choose a photo under 15 MB.", file.bytes);
    return pass("file", "File", "JPEG, PNG or WebP, under 15 MB.", file.type);
}
export function sizeChecks(width, height, purpose) {
    const out = [];
    const side = Math.min(width, height), min = purpose === "styling" ? PRECHECK_LIMITS.minSideStyling : PRECHECK_LIMITS.minSideLocal;
    if (side < min)
        out.push(block("size", "Size", `The short side is ${side} px. ${purpose === "styling" ? "Styling" : "Editing"} needs at least ${min} px.`, side));
    else if (side < PRECHECK_LIMITS.smallSide)
        out.push(warn("size", "Size", `The short side is ${side} px. A photo of ${PRECHECK_LIMITS.smallSide} px or more gives finer results.`, side));
    else
        out.push(pass("size", "Size", `${width} × ${height} px is large enough.`, side));
    const aspect = Math.max(width, height) / Math.min(width, height);
    if (aspect > PRECHECK_LIMITS.maxAspect) {
        const level = purpose === "styling" ? block : warn;
        out.push(level("shape", "Shape", `The photo is ${round(aspect, 1)} times longer than it is wide. Crop it closer to the subject.`, round(aspect, 2)));
    }
    else
        out.push(pass("shape", "Shape", "The photo's shape is fine.", round(aspect, 2)));
    return out;
}
/** Measure a photo. Pure: same pixels and options give the same report. */
export function precheck(image, options = {}) {
    requireColour(image);
    const purpose = options.purpose ?? "local";
    if (purpose !== "local" && purpose !== "styling")
        throw new RangeError("Pre-check purpose must be local or styling");
    const checks = [];
    const file = fileCheck(options.file);
    if (file)
        checks.push(file);
    checks.push(...sizeChecks(image.width, image.height, purpose));
    const factor = Math.min(1, PRECHECK_LIMITS.analysisSide / Math.max(image.width, image.height));
    const small = factor < 1 ? asRGB(resize(image, Math.max(8, Math.round(image.width * factor)), Math.max(8, Math.round(image.height * factor)))) : asRGB(image);
    const spread = lumaStd(small);
    const measured = { luma_std: round(spread) };
    if (spread < PRECHECK_LIMITS.blankStd) {
        checks.push(block("content", "Content", "The photo is almost one flat colour. Choose a photo with a visible subject.", round(spread)));
    }
    else {
        const a = analyse(small);
        // Compression blocks sit on the file's own 8-pixel grid, so they are measured at full size: the
        // shrink to 512 px moves that grid, and a 4:5 shrink (640 to 512) draws a 4-pixel sampling
        // pattern of its own that the 8-pixel measure reads as blocks on a clean photo.
        if (small !== image && factor < 1)
            a.blockiness = blockiness(luma255(asRGB(image)));
        Object.assign(measured, { ev_offset: round(a.ev_offset), clipped_bright: round(a.clipped_bright, 4), clipped_dark: round(a.clipped_dark, 4),
            blur_sigma: round(a.blur_sigma), noise_sigma: round(a.noise_sigma), blockiness: round(a.blockiness, 4),
            cast_chroma: round(Math.hypot(a.cast_ab[0], a.cast_ab[1])) });
        if (a.ev_offset > PRECHECK_LIMITS.evWarn)
            checks.push(warn("light", "Light", "The photo is dark. Face a window or a lamp, or use Enhance first.", round(a.ev_offset)));
        else if (a.ev_offset < -PRECHECK_LIMITS.evWarn)
            checks.push(warn("light", "Light", "The photo is very bright. Move out of direct light.", round(a.ev_offset)));
        else
            checks.push(pass("light", "Light", "Brightness is in a good range.", round(a.ev_offset)));
        if (a.clipped_bright > PRECHECK_LIMITS.clippedBrightWarn)
            checks.push(warn("highlights", "Highlights", `${Math.round(a.clipped_bright * 100)}% of the photo is pure white, so detail there is lost.`, round(a.clipped_bright, 4)));
        else if (a.clipped_dark > PRECHECK_LIMITS.clippedDarkWarn)
            checks.push(warn("highlights", "Shadows", `${Math.round(a.clipped_dark * 100)}% of the photo is pure black, so detail there is lost.`, round(a.clipped_dark, 4)));
        else
            checks.push(pass("highlights", "Highlights and shadows", "Few pixels are pure white or pure black.", round(a.clipped_bright, 4)));
        const shaken = a.blur_type === "motion" && a.blur_sigma > PRECHECK_LIMITS.motionWarn;
        if (shaken || a.blur_sigma > PRECHECK_LIMITS.blurWarn) {
            checks.push(warn("sharpness", "Sharpness", shaken ? "The photo looks shaken. Hold still or rest the phone on something." : "The photo looks out of focus. Tap to focus before taking it.", round(a.blur_sigma)));
        }
        else
            checks.push(pass("sharpness", "Sharpness", "The photo looks sharp enough.", round(a.blur_sigma)));
        if (a.noise_sigma > PRECHECK_LIMITS.noiseWarn)
            checks.push(warn("noise", "Grain", "The photo is grainy, usually from low light. Enhance can reduce it.", round(a.noise_sigma)));
        else
            checks.push(pass("noise", "Grain", "Little grain.", round(a.noise_sigma)));
        const chroma = Math.hypot(a.cast_ab[0], a.cast_ab[1]);
        if (chroma > PRECHECK_LIMITS.castWarn)
            checks.push(warn("colour", "Colour", "The light gives the photo a strong colour tint, which can throw off colour matching.", round(chroma)));
        else
            checks.push(pass("colour", "Colour", "No strong colour tint.", round(chroma)));
        if (a.blockiness > PRECHECK_LIMITS.blockWarn)
            checks.push(warn("compression", "Compression", "The photo shows compression blocks. Use the original file if you have it.", round(a.blockiness, 4)));
        else
            checks.push(pass("compression", "Compression", "No visible compression blocks.", round(a.blockiness, 4)));
    }
    if (options.face)
        checks.push(...faceChecks(options.face, image.width, image.height));
    else if (purpose === "styling")
        checks.push(warn("face", "Face", "Face framing isn't checked in this editor; the styling screen checks it before sending.", "not checked"));
    const verdict = checks.some((c) => c.level === "block") ? "blocked" : checks.some((c) => c.level === "warn") ? "warn" : "ready";
    return { version: PRECHECK_VERSION, purpose, verdict, checks, analysed: { width: small.width, height: small.height }, measured, limits: PRECHECK_LIMITS };
}
/** The classic screen's framing checks on recorded points. Framing problems are warnings here;
 * "face too small for skin analysis" is not checked because no skin analysis runs in the studio. */
export function faceChecks(face, width, height) {
    if (face.length < 468)
        return [warn("face", "Face", "The face fixture is incomplete, so framing isn't checked.", face.length)];
    const points = face.map(([x, y]) => ({ x: x / width, y: y / height, z: 0 }));
    return runChecks(points, width, height, null, false).map((c) => ({
        id: `face-${c.id}`, title: "Face", message: c.message,
        level: c.ok ? "pass" : "warn",
    }));
}
/** One line for the status bar: "5 of 7 checks passed, 2 to look at". */
export function summarise(report) {
    const passed = report.checks.filter((c) => c.level === "pass").length;
    const warned = report.checks.filter((c) => c.level === "warn").length;
    const blocked = report.checks.filter((c) => c.level === "block").length;
    if (blocked)
        return `Can't use this photo for ${report.purpose === "styling" ? "styling" : "editing"}: ${blocked} check${blocked === 1 ? "" : "s"} failed.`;
    return `${passed} of ${report.checks.length} checks passed${warned ? `, ${warned} to look at` : ""}.`;
}
