/** BELJOUR Quality Generator output tiers, fixed-frame planning and admission.
 * HD 1080 is a 1920 x 1080 landscape or 1080 x 1920 portrait frame. The source is
 * fitted inside it without cropping (contained aspect) and any spare area is
 * padded white. A source that would need more than fourfold enlargement is
 * refused, as is any request whose estimated working memory exceeds the limit.
 * The 4K frames (3840 x 2160 and 2160 x 3840) exist as geometry only here: a 4K
 * plan is refused until separate quality, memory, cancellation and device
 * checks pass. No pixels are touched in this module. Author: John Khan.
 */
export const TIER_FRAMES = Object.freeze({
    hd1080: Object.freeze({ landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } }),
    uhd4k: Object.freeze({ landscape: { width: 3840, height: 2160 }, portrait: { width: 2160, height: 3840 } }),
});
export const TIER_LABELS = { hd1080: "HD 1080", uhd4k: "4K" };
export const MAX_ENLARGEMENT = 4;
export const MAX_SOURCE_PIXELS = 24_000_000;
export const MIN_SOURCE_SIDE = 16;
/** ASSUMED planning bytes per pixel: RGBA source; RGBA reference, detailed and
 * output frames; one float32 luminance plane and its blur. */
export const SOURCE_BYTES_PER_PIXEL = 4;
export const OUTPUT_BYTES_PER_PIXEL = 4 * 3 + 4 * 2;
export const DEFAULT_WORKING_LIMIT = 384 * 1024 * 1024;
export const MAX_WORKING_LIMIT = 512 * 1024 * 1024;
export class TierRefused extends RangeError {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "TierRefused";
    }
}
export function checkedSourceSize(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < MIN_SOURCE_SIDE || height < MIN_SOURCE_SIDE || width > 16_384 || height > 16_384) {
        throw new TierRefused("source_dimensions", "The photo size is outside the supported range.");
    }
    if (width * height > MAX_SOURCE_PIXELS) {
        throw new TierRefused("source_too_large", "The photo has more than 24 megapixels.");
    }
}
export function workingBytes(sourceWidth, sourceHeight, width, height) {
    return sourceWidth * sourceHeight * SOURCE_BYTES_PER_PIXEL + width * height * OUTPUT_BYTES_PER_PIXEL;
}
/** Refuse a job whose estimate exceeds the working limit (default 384 MiB, ceiling 512 MiB). */
export function admitWorkingMemory(bytes, limit = DEFAULT_WORKING_LIMIT) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_WORKING_LIMIT) {
        throw new TierRefused("invalid_limit", "Invalid working memory limit.");
    }
    if (bytes > limit)
        throw new TierRefused("memory", "This job needs more working memory than allowed.");
    return bytes;
}
export function orientationOf(width, height) {
    return width >= height ? "landscape" : "portrait";
}
/** Contain the source in the tier frame, centred, without cropping. */
export function planFixedTier(sourceWidth, sourceHeight, tier = "hd1080", options = {}) {
    checkedSourceSize(sourceWidth, sourceHeight);
    if (!(tier in TIER_FRAMES))
        throw new TierRefused("unknown_tier", "Unknown output tier.");
    if (tier === "uhd4k" && options.allow4k !== true) {
        throw new TierRefused("tier_blocked", "4K output is not available yet.");
    }
    const orientation = orientationOf(sourceWidth, sourceHeight);
    const frame = TIER_FRAMES[tier][orientation];
    const scale = Math.min(frame.width / sourceWidth, frame.height / sourceHeight);
    if (scale > MAX_ENLARGEMENT) {
        throw new TierRefused("enlargement", "This photo would need more than fourfold enlargement.");
    }
    const contentWidth = Math.min(frame.width, Math.max(1, Math.round(sourceWidth * scale)));
    const contentHeight = Math.min(frame.height, Math.max(1, Math.round(sourceHeight * scale)));
    const bytes = admitWorkingMemory(workingBytes(sourceWidth, sourceHeight, frame.width, frame.height), options.workingLimit);
    return Object.freeze({
        tier, orientation, sourceWidth, sourceHeight, width: frame.width, height: frame.height,
        contentWidth, contentHeight,
        offsetX: Math.floor((frame.width - contentWidth) / 2),
        offsetY: Math.floor((frame.height - contentHeight) / 2),
        enlargement: scale, padded: contentWidth !== frame.width || contentHeight !== frame.height,
        workingBytes: bytes,
    });
}
/** The same layout shrunk so the frame's long edge is at most `maxEdge` (previews). */
export function scaledPlan(plan, maxEdge) {
    if (!Number.isInteger(maxEdge) || maxEdge < 32)
        throw new RangeError("Invalid preview edge");
    const factor = Math.min(1, maxEdge / Math.max(plan.width, plan.height));
    if (factor === 1)
        return plan;
    const width = Math.max(1, Math.round(plan.width * factor));
    const height = Math.max(1, Math.round(plan.height * factor));
    const contentWidth = Math.min(width, Math.max(1, Math.round(plan.contentWidth * factor)));
    const contentHeight = Math.min(height, Math.max(1, Math.round(plan.contentHeight * factor)));
    return Object.freeze({
        ...plan, width, height, contentWidth, contentHeight,
        offsetX: Math.floor((width - contentWidth) / 2), offsetY: Math.floor((height - contentHeight) / 2),
        enlargement: plan.enlargement * factor,
        padded: contentWidth !== width || contentHeight !== height,
        workingBytes: workingBytes(plan.sourceWidth, plan.sourceHeight, width, height),
    });
}
