/** Original front-view frame drawings. Author: John Khan. */
import { alphaBlend, lineMask, maskUnion, restore, ringMask } from "./common.js";
export const LABEL = "Atelier Frames — original front-view frame geometry; no brand shapes or logos.";
export const DEFAULT_GLASSES = { style: "round", colour: [42, 39, 38], scale: 1, thickness: 0.055 };
export function renderGlasses(image, width, height, left, right, options = DEFAULT_GLASSES, iris, protectedMask) {
    const iod = Math.max(Math.abs(right.x - left.x), 1);
    const rx = iod * 0.35 * options.scale;
    const ry = rx * (options.style === "soft_square" || options.style === "wing" ? 0.76 : 0.90);
    const inner = Math.max(0.55, 1 - options.thickness * 2.4);
    const rings = maskUnion(ringMask(width, height, left, rx, ry, inner), ringMask(width, height, right, rx, ry, inner));
    const midpoint = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    const bridgeHalf = iod * 0.08;
    const bridge = lineMask(width, height, { x: midpoint.x - bridgeHalf, y: midpoint.y }, { x: midpoint.x + bridgeHalf, y: midpoint.y }, Math.max(1, iod * options.thickness * 0.35));
    const temples = maskUnion(lineMask(width, height, { x: left.x - iod * 0.34, y: left.y }, { x: left.x - iod * 0.58, y: left.y - iod * 0.04 }, Math.max(1, iod * 0.018)), lineMask(width, height, { x: right.x + iod * 0.34, y: right.y }, { x: right.x + iod * 0.58, y: right.y - iod * 0.04 }, Math.max(1, iod * 0.018)));
    const frame = maskUnion(rings, bridge, temples);
    if (options.style === "wire")
        for (let i = 0; i < frame.length; i += 1)
            frame[i] = Math.min(frame[i], 190);
    let out = alphaBlend(image, width, height, options.colour, frame, 245);
    if (iris)
        out = restore(out, image, iris);
    return protectedMask ? restore(out, image, protectedMask) : out;
}
//# sourceMappingURL=glasses.js.map