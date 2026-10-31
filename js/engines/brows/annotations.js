/** Manual observed-brow correction, with strict portable data. Author: John Khan. */
import { boolean, choice, number, photo, validateEvidence } from "./contracts.js";
import { browFrames, drawPath, union } from "./geometry.js";
export const ANNOTATION_FORMAT = "beljour-brow-observations/1";
export const MAX_MARKS = 256;
export const MAX_POINTS = 512;
export const MAX_JSON_BYTES = 1048576;
export function validateMarks(value) {
    if (!Array.isArray(value) || value.length > MAX_MARKS)
        throw new RangeError("annotations need a list of at most 256 marks");
    const result = value.map(mark => {
        if (!mark || typeof mark !== "object" || Array.isArray(mark) || Object.keys(mark).sort().join(",") !== "mode,opacity,points,radius") {
            throw new RangeError("annotation fields must be mode, radius, points and opacity");
        }
        const mode = choice(mark.mode, "mode", ["hair", "grey", "erase"]);
        const radius = number(mark.radius, "radius", 0.0005, 0.05);
        const opacity = number(mark.opacity, "opacity", 0, 1);
        if (!Array.isArray(mark.points) || mark.points.length < 1 || mark.points.length > MAX_POINTS)
            throw new RangeError("each annotation needs 1..512 points");
        const points = mark.points.map((point) => {
            if (!Array.isArray(point) || point.length !== 2)
                throw new RangeError("annotation points are normalized x,y pairs");
            return [number(point[0], "x", 0, 1), number(point[1], "y", 0, 1)];
        });
        return { mode, radius, points, opacity };
    });
    if (result.reduce((total, mark) => total + mark.points.length, 0) > 4096)
        throw new RangeError("annotations may contain at most 4096 total points");
    return result;
}
export function annotateBrows(image, landmarks, marks, base, reviewed = false) {
    photo(image);
    boolean(reviewed, "reviewed");
    const validated = validateMarks(marks), region = union(browFrames(landmarks, image.width, image.height));
    const previous = base === undefined ? undefined : validateEvidence(base, image, region);
    const coverage = previous?.coverage.slice() ?? new Float64Array(region.length);
    const grey = previous?.grey.slice() ?? new Float64Array(region.length);
    for (const mark of validated) {
        const points = mark.points.map(([x, y]) => [x * image.width, y * image.height]);
        if (points.length === 1)
            points.push(points[0]);
        const alpha = new Float64Array(region.length);
        const diameter = Math.max(0.25, mark.radius * Math.min(image.width, image.height) * 2);
        drawPath(alpha, image.width, image.height, points, diameter, mark.opacity, region);
        for (let i = 0; i < alpha.length; i++) {
            if (mark.mode === "erase") {
                coverage[i] *= 1 - alpha[i];
                grey[i] *= 1 - alpha[i];
            }
            else {
                coverage[i] = Math.max(coverage[i], alpha[i]);
                grey[i] = mark.mode === "grey" ? Math.max(grey[i], alpha[i]) : grey[i] * (1 - alpha[i]);
            }
            grey[i] = Math.min(grey[i], coverage[i]);
        }
    }
    return validateEvidence({ coverage, grey, origin: reviewed ? "manual" : "contrast", confidence: reviewed ? 1 : 0,
        notes: reviewed ? ["Visible hair coverage manually checked on this photo."] : ["Manual marks are incomplete until you confirm review of both brows."] }, image, region);
}
export function observationDocument(width, height, marks, reviewed = false) {
    number(width, "width", 8, 4096);
    number(height, "height", 8, 4096);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 4194304)
        throw new RangeError("annotation image dimensions exceed the photo contract");
    return { format: ANNOTATION_FORMAT, author: "John Khan", width, height, reviewed: boolean(reviewed, "reviewed"), marks: validateMarks(marks) };
}
export function parseObservations(value, expectedSize) {
    let data = value;
    if (typeof data === "string") {
        if (new TextEncoder().encode(data).length > MAX_JSON_BYTES)
            throw new RangeError("annotation document exceeds 1 MiB");
        try {
            data = JSON.parse(data);
        }
        catch {
            throw new RangeError("invalid annotation JSON");
        }
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).sort().join(",") !== "author,format,height,marks,reviewed,width") {
        throw new RangeError("unknown annotation document fields");
    }
    const object = data;
    if (object.format !== ANNOTATION_FORMAT || object.author !== "John Khan")
        throw new RangeError("unknown annotation format or author");
    const width = number(object.width, "width", 8, 4096), height = number(object.height, "height", 8, 4096);
    const checked = observationDocument(width, height, object.marks, boolean(object.reviewed, "reviewed"));
    if (expectedSize && (checked.width !== expectedSize[0] || checked.height !== expectedSize[1]))
        throw new RangeError("annotation dimensions do not match the current photo");
    return checked;
}
export function exportObservations(document) {
    const encoded = JSON.stringify(parseObservations(document));
    if (new TextEncoder().encode(encoded).length > MAX_JSON_BYTES)
        throw new RangeError("annotation document exceeds 1 MiB");
    return encoded;
}
export function simplifyMark(points, minimumDistance = 0.001) {
    const distance = number(minimumDistance, "minimumDistance", 0, 0.05);
    const checked = validateMarks([{ mode: "hair", radius: 0.005, opacity: 1, points }])[0].points;
    const result = [checked[0]];
    for (const point of checked.slice(1, -1)) {
        const last = result[result.length - 1];
        if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= distance)
            result.push(point);
    }
    const last = checked[checked.length - 1], previous = result[result.length - 1];
    if (checked.length > 1 && (last[0] !== previous[0] || last[1] !== previous[1]))
        result.push(last);
    return result;
}
