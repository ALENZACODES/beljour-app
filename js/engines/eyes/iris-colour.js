/** Iris-only Lab recolour with original catchlight, pupil and rim.
 * Mirrors api/plumb_api/engines/eyes/iris_colour.py. Author: John Khan.
 */
import { blank, finitePhotograph, readLab, validate, writeLab } from "../beauty/effect-core.js";
export const SHADES = {
    forest: [-12, 10], hazel: [8, 24], slate: [0, -5], amber: [12, 31],
    ocean: [-4, -15], olive: [-8, 18], cocoa: [10, 17], smoke: [2, -1],
};
export const LABEL = "Eye colour simulation. Eye details come from your original photo.";
export function irisColour(image, iris, shade = "forest", strength = 65, pupil) {
    validate(image, iris, strength);
    finitePhotograph(image);
    if (!(shade in SHADES))
        throw new RangeError("unknown original iris shade");
    if (pupil) {
        if (pupil.length !== image.width * image.height)
            throw new RangeError("pupil plane differs from iris");
        for (let i = 0; i < pupil.length; i++)
            if (!Number.isFinite(pupil[i]) || pupil[i] < 0 || pupil[i] > 1)
                throw new RangeError("invalid pupil mask");
    }
    const result = blank(image, "iris unobserved or eye closed");
    if (!strength)
        return result;
    let xMin = image.width, yMin = image.height, xMax = -1, yMax = -1, found = 0;
    for (let i = 0; i < iris.length; i++) {
        if (iris[i] < 0.5)
            continue;
        const x = i % image.width, y = Math.floor(i / image.width);
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
        found++;
    }
    if (found < 12)
        return result;
    const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
    const rx = Math.max((xMax - xMin) / 2, 1), ry = Math.max((yMax - yMin) / 2, 1);
    for (let i = 0; i < iris.length; i++) {
        if (iris[i] < 0.5 || (pupil && pupil[i] >= 0.5))
            continue;
        const x = i % image.width, y = Math.floor(i / image.width);
        const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const [l, a, b] = readLab(image, i);
        if (r <= 0.35 || l > 85)
            continue;
        const amount = strength / 100 * 0.7;
        writeLab(result.image, i, [l - (r >= 0.88 ? amount * 7 : 0),
            a + amount * (SHADES[shade][0] - a), b + amount * (SHADES[shade][1] - b)]);
        result.alpha[i] = amount;
        result.changed++;
    }
    result.reason = result.changed ? "measured local edit" : "iris unobserved or eye closed";
    return result;
}
