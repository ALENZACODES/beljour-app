/** Explicit allocation allowances, not a measured browser heap guarantee. Author: John Khan. */
import { EffectUnavailable, integer } from "./types.js";
export const MIB = 1024 * 1024;
export const DEFAULT_BUDGET = 256 * MIB;
export const MIN_BUDGET = 8 * MIB;
export const MAX_BUDGET = 2048 * MIB;
export const SCRATCH_BYTES_PER_PIXEL = {
    "ink-study": 192, "pigment-oil": 640, "meadow-crown": 160,
};
export function exportAllocation(effectId, width, height, channels, requestedTile = 512, halo = 1, budgetBytes = DEFAULT_BUDGET) {
    if (!Object.hasOwn(SCRATCH_BYTES_PER_PIXEL, effectId)) {
        throw new EffectUnavailable("not_tileable", "this effect has no bounded export allocation plan");
    }
    const w = integer(width, "width", 2, 8192), h = integer(height, "height", 2, 8192);
    const c = integer(channels, "channels", 3, 4), requested = integer(requestedTile, "tile_size", 32, 1024);
    const pad = integer(halo, "halo", 0, 12), budget = integer(budgetBytes, "budget_bytes", MIN_BUDGET, MAX_BUDGET);
    if (w * h > 16_777_216)
        throw new RangeError("artistic export exceeds the 16 MP working limit");
    const frames = w * h * c * 2, remaining = budget - frames, perPixel = SCRATCH_BYTES_PER_PIXEL[effectId];
    if (remaining <= 0)
        throw new EffectUnavailable("memory_budget", "export buffers exceed the chosen local memory allowance");
    const bound = Math.floor(Math.sqrt(remaining / perPixel)) - 2 * pad, side = Math.min(requested, bound);
    if (side < 32)
        throw new EffectUnavailable("memory_budget", "no minimum tile fits the chosen local memory allowance");
    const scratch = Math.min(w, side + 2 * pad) * Math.min(h, side + 2 * pad) * perPixel;
    return { tile_size: side, budget_bytes: budget, frame_bytes: frames, scratch_bytes: scratch,
        estimated_peak_bytes: frames + scratch, planned_tiles: Math.ceil(w / side) * Math.ceil(h / side), halo: pad };
}
//# sourceMappingURL=resources.js.map