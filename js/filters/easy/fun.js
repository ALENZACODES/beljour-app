/** Original still-photo ear, nose and tongue artwork. Author: John Khan. */
import { alphaBlend, ellipseMask, lineMask, maskUnion, restore, triangleMask } from "./common.js";
export const LABEL = "Playful Paws — original drawn ears and nose; tongue appears only for an open mouth.";
export const DEFAULT_FUN = { amount: 1, mouthOpen: 0 };
export function renderFun(image, width, height, left, right, nose, mouth, options = DEFAULT_FUN, iris, protectedMask) {
    const iod = Math.max(Math.abs(right.x - left.x), 1);
    const top = Math.min(left.y, right.y) - iod * 0.86;
    const leftEar = triangleMask(width, height, { x: left.x - iod * 0.47, y: left.y - iod * 0.26 }, { x: left.x - iod * 0.22, y: top }, { x: left.x + iod * 0.02, y: left.y - iod * 0.28 });
    const rightEar = triangleMask(width, height, { x: right.x - iod * 0.02, y: right.y - iod * 0.28 }, { x: right.x + iod * 0.22, y: top }, { x: right.x + iod * 0.47, y: right.y - iod * 0.26 });
    let out = alphaBlend(image, width, height, [104, 66, 52], maskUnion(leftEar, rightEar), Math.floor(235 * options.amount));
    const innerLeft = triangleMask(width, height, { x: left.x - iod * 0.37, y: left.y - iod * 0.27 }, { x: left.x - iod * 0.22, y: top + iod * 0.18 }, { x: left.x - iod * 0.07, y: left.y - iod * 0.29 });
    const innerRight = triangleMask(width, height, { x: right.x + iod * 0.07, y: right.y - iod * 0.29 }, { x: right.x + iod * 0.22, y: top + iod * 0.18 }, { x: right.x + iod * 0.37, y: right.y - iod * 0.27 });
    out = alphaBlend(out, width, height, [190, 123, 118], maskUnion(innerLeft, innerRight), Math.floor(205 * options.amount));
    const noseMask = ellipseMask(width, height, nose, iod * 0.105, iod * 0.075);
    out = alphaBlend(out, width, height, [63, 48, 45], noseMask, Math.floor(230 * options.amount));
    if (options.mouthOpen >= 0.35) {
        const tongue = ellipseMask(width, height, { x: mouth.x, y: mouth.y + iod * 0.18 }, iod * 0.12, iod * 0.22);
        out = alphaBlend(out, width, height, [199, 101, 116], tongue, Math.floor(225 * options.amount));
        const groove = lineMask(width, height, { x: mouth.x, y: mouth.y + iod * 0.13 }, { x: mouth.x, y: mouth.y + iod * 0.28 }, Math.max(1, iod * 0.012));
        out = alphaBlend(out, width, height, [132, 66, 81], groove, Math.floor(150 * options.amount));
    }
    if (iris)
        out = restore(out, image, iris);
    return protectedMask ? restore(out, image, protectedMask) : out;
}
