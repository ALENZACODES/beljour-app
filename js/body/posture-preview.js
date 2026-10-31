/** Bounded posture preview preparation: one source, a 512-pixel drag frame, a full release frame.
 * Image, person mask, head mask and control points are scaled together so a preview never
 * pairs a small image with full-size geometry. The source is copied, never modified.
 * Author: John Khan.
 */
import { areaWeights, floatImage, resizeArea } from "../engines/core/buffer.js";
import { makeControls } from "../engines/local/posture.js";
import { posturePreviewSize } from "./posture-session.js";
import { checkedHeadMask, checkedSource, copyByteImage } from "./posture-safe.js";
function checkedMask(mask, width, height, what) {
    if (!mask || mask.width !== width || mask.height !== height || mask.channels !== 1 ||
        mask.data.length !== width * height) {
        throw new RangeError(`${what} mask must match the photo`);
    }
}
/** Exact area averaging for a one-channel mask (shrink only). */
export function shrinkMask(mask, width, height) {
    if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 &&
        width <= mask.width && height <= mask.height)) {
        throw new RangeError("mask resize only shrinks");
    }
    const wy = areaWeights(mask.height, height), wx = areaWeights(mask.width, width);
    const rows = new Float64Array(height * mask.width);
    for (let y = 0; y < height; y++) {
        for (const [j, weight] of wy[y]) {
            for (let x = 0; x < mask.width; x++)
                rows[y * mask.width + x] += weight * mask.data[j * mask.width + x];
        }
    }
    const out = floatImage(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (const [k, weight] of wx[x])
                sum += weight * rows[y * mask.width + k];
            out.data[y * width + x] = Math.min(1, Math.max(0, sum));
        }
    }
    return out;
}
/** Pixel-centre aligned point scaling, so geometry follows the resampled image. */
export function scaleControls(controls, width, height) {
    const sx = width / controls.width, sy = height / controls.height;
    const points = {};
    for (const [name, [x, y]] of Object.entries(controls.points)) {
        points[name] = [(x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5];
    }
    return makeControls(controls.view, points, width, height, controls.facing, controls.estimated, controls.manual);
}
/** Validate a frame, then return a bounded drag preview or an owned full-size release copy. */
export function preparePostureFrame(frame, released) {
    const image = checkedSource(frame.image);
    const { width, height } = image;
    checkedMask(frame.person, width, height, "person");
    checkedHeadMask(frame.head, width, height);
    if (frame.controls.width !== width || frame.controls.height !== height) {
        throw new RangeError("control points were placed on a photo of another size");
    }
    const size = posturePreviewSize(width, height, released);
    if (size.width === width && size.height === height) {
        return { image: copyByteImage(image), person: { ...frame.person, data: new Float32Array(frame.person.data) },
            head: { ...frame.head, data: new Float32Array(frame.head.data) }, controls: frame.controls, size,
            stage: released ? "release" : "preview" };
    }
    return { image: resizeArea(image, size.width, size.height),
        person: shrinkMask(frame.person, size.width, size.height),
        head: shrinkMask(frame.head, size.width, size.height),
        controls: scaleControls(frame.controls, size.width, size.height), size, stage: "preview" };
}
