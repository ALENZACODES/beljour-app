/** Aspect-preserving HD 1080 and 4K output planning.
 * The long edge is exactly 1920 (HD 1080) or 3840 (4K). The short edge follows
 * the source aspect, rounded to the nearest pixel, so the aspect error stays
 * within half an output pixel. There is no crop, no letterbox and no
 * orientation change, and an unsupported job is refused rather than silently
 * downgraded to a smaller tier. Limits: at most 4x enlargement, a 24 MP decoded
 * source, a 16 MP output, and the working-memory admission from
 * `quality-tier.ts`. 4K is marked experimental until a physical-device check.
 * The plan has the TierPlan shape (content fills the frame) so the existing
 * quality stages can use it. Author: John Khan.
 */
import { MAX_ENLARGEMENT, TIER_LABELS, TierRefused, admitWorkingMemory, checkedSourceSize, orientationOf, workingBytes, } from "./quality-tier.js";
export const LONG_EDGE = { hd1080: 1920, uhd4k: 3840 };
export const MAX_OUTPUT_PIXELS = 16_000_000;
export function planAspectQuality(sourceWidth, sourceHeight, tier = "hd1080", options = {}) {
    checkedSourceSize(sourceWidth, sourceHeight);
    if (!(tier in LONG_EDGE))
        throw new TierRefused("unknown_tier", "Unknown output tier.");
    const orientation = orientationOf(sourceWidth, sourceHeight);
    const sourceLong = Math.max(sourceWidth, sourceHeight);
    const sourceShort = Math.min(sourceWidth, sourceHeight);
    const long = LONG_EDGE[tier];
    const enlargement = long / sourceLong;
    if (enlargement > MAX_ENLARGEMENT) {
        throw new TierRefused("enlargement", `${TIER_LABELS[tier]} would need more than fourfold enlargement.`);
    }
    const exactShort = long * sourceShort / sourceLong;
    const short = Math.max(1, Math.round(exactShort));
    const width = orientation === "landscape" ? long : short;
    const height = orientation === "landscape" ? short : long;
    if (width * height > MAX_OUTPUT_PIXELS) {
        throw new TierRefused("output_too_large", "The output would exceed 16 megapixels.");
    }
    const bytes = admitWorkingMemory(workingBytes(sourceWidth, sourceHeight, width, height), options.workingLimit);
    return Object.freeze({
        tier, orientation, sourceWidth, sourceHeight, width, height,
        contentWidth: width, contentHeight: height, offsetX: 0, offsetY: 0,
        enlargement, padded: false, workingBytes: bytes,
        experimental: tier === "uhd4k",
        aspectErrorPixels: Math.abs(short - exactShort),
    });
}
/** A plan for an arbitrary target size (paired diagnostics), same rules otherwise. */
export function planCustomQuality(sourceWidth, sourceHeight, width, height) {
    checkedSourceSize(sourceWidth, sourceHeight);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_OUTPUT_PIXELS) {
        throw new TierRefused("output_dimensions", "Invalid output size.");
    }
    const enlargement = Math.max(width / sourceWidth, height / sourceHeight);
    if (enlargement > MAX_ENLARGEMENT)
        throw new TierRefused("enlargement", "More than fourfold enlargement.");
    return Object.freeze({
        tier: "hd1080", orientation: orientationOf(width, height), sourceWidth, sourceHeight, width, height,
        contentWidth: width, contentHeight: height, offsetX: 0, offsetY: 0, enlargement, padded: false,
        workingBytes: admitWorkingMemory(workingBytes(sourceWidth, sourceHeight, width, height)),
        experimental: false,
        aspectErrorPixels: Math.abs(height - width * sourceHeight / sourceWidth),
    });
}
/** Preview geometry: the same aspect with the long edge capped. */
export function previewOf(plan, maxEdge = 640) {
    if (!Number.isInteger(maxEdge) || maxEdge < 32)
        throw new RangeError("Invalid preview edge");
    const factor = Math.min(1, maxEdge / Math.max(plan.width, plan.height));
    if (factor === 1)
        return plan;
    const width = Math.max(1, Math.round(plan.width * factor));
    const height = Math.max(1, Math.round(plan.height * factor));
    return Object.freeze({
        ...plan, width, height, contentWidth: width, contentHeight: height,
        enlargement: plan.enlargement * factor,
        workingBytes: workingBytes(plan.sourceWidth, plan.sourceHeight, width, height),
    });
}
//# sourceMappingURL=quality-aspect.js.map