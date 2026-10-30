export const MAX_EVIDENCE_BYTES = 12 * 1024 * 1024;
export const MAX_PREVIEW_SIDE = 640;
export const MAX_TRACES = 256;
const ANATOMIES = ["open", "hooded", "monolid", "deep_set"];
function record(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RangeError(`${label} must be an object.`);
    const data = value;
    if (Object.keys(data).some(key => ["__proto__", "prototype", "constructor"].includes(key))) {
        throw new RangeError(`${label} contains a reserved key.`);
    }
    return data;
}
function number(value, low, high, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
        throw new RangeError(`${label} must be finite in ${low}..${high}.`);
    }
    return value;
}
export function normalPoint(value) {
    if (!Array.isArray(value) || value.length !== 2)
        throw new RangeError("Each point must contain exactly x and y.");
    return [number(value[0], 0, 1, "Point x"), number(value[1], 0, 1, "Point y")];
}
export function validateLandmarks(value) {
    if (!Array.isArray(value) || value.length !== 478)
        throw new RangeError("A checked 478-point face mesh is required.");
    const points = value.map(normalPoint);
    const right = points[33], left = points[263];
    const distance = Math.hypot(left[0] - right[0], left[1] - right[1]);
    if (distance < 0.025 || distance > 0.95)
        throw new RangeError("The eye spacing is outside this preview's supported range.");
    for (const [a, b] of [[33, 133], [263, 362], [61, 291]]) {
        if (Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]) < 0.005) {
            throw new RangeError("The face points contain a collapsed eye or mouth.");
        }
    }
    return points;
}
export function validateTrace(value) {
    const data = record(value, "Lash trace");
    const allowed = new Set(["side", "lower", "confidence", "points"]);
    if (Object.keys(data).some(key => !allowed.has(key)))
        throw new RangeError("Unknown lash observation field.");
    if (data.side !== "right" && data.side !== "left")
        throw new RangeError("Choose a side for each lash.");
    if (typeof data.lower !== "boolean")
        throw new RangeError("A lash trace must say whether it is a lower lash.");
    if (!Array.isArray(data.points) || data.points.length < 2 || data.points.length > 64) {
        throw new RangeError("Each lash trace needs 2..64 points.");
    }
    const points = data.points.map(normalPoint);
    let length = 0;
    for (let i = 1; i < points.length; i++)
        length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (length < 0.0001 || length > 0.3)
        throw new RangeError("This trace is too short or too long to be a lash.");
    return { side: data.side, lower: data.lower, confidence: number(data.confidence, 0, 1, "Confidence"), points };
}
export function validateAnatomy(value) {
    const data = record(value, "Eye anatomy");
    if (Object.keys(data).some(key => key !== "right" && key !== "left"))
        throw new RangeError("Unknown anatomy field.");
    if (!ANATOMIES.includes(String(data.right)) || !ANATOMIES.includes(String(data.left)))
        throw new RangeError("Unknown eye anatomy.");
    return { right: data.right, left: data.left };
}
export function validateImage(image) {
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 16 || image.height < 16
        || image.width > MAX_PREVIEW_SIDE || image.height > MAX_PREVIEW_SIDE || image.channels !== 4
        || !(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) {
        throw new RangeError("The preview must contain 16..640 pixel RGBA dimensions and complete bytes.");
    }
}
export async function pixelFingerprint(image) {
    validateImage(image);
    const prefix = new TextEncoder().encode(`${image.width}x${image.height}x4:`);
    const payload = new Uint8Array(prefix.length + image.data.length);
    payload.set(prefix);
    payload.set(image.data, prefix.length);
    const digest = await crypto.subtle.digest("SHA-256", payload);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
/** Nothing in an imported document can grant consent. */
export function parseEvidence(text, image, fingerprint) {
    validateImage(image);
    if (new TextEncoder().encode(text).length > MAX_EVIDENCE_BYTES)
        throw new RangeError("The local evidence file is too large.");
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new RangeError("The local evidence file is not valid JSON.");
    }
    const data = record(value, "Evidence");
    const allowed = new Set(["format", "width", "height", "pixel_sha256", "landmarks", "hair_mask", "observed_lashes", "anatomy"]);
    if (Object.keys(data).some(key => !allowed.has(key)))
        throw new RangeError("Unknown evidence field; consent cannot be imported.");
    if (data.format !== "beljour-eyes-brows-input/1")
        throw new RangeError("Unsupported local evidence format.");
    if (data.width !== image.width || data.height !== image.height)
        throw new RangeError("Evidence dimensions do not match this preview.");
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || data.pixel_sha256 !== fingerprint)
        throw new RangeError("Evidence belongs to a different photo.");
    const out = { format: data.format, width: image.width, height: image.height,
        pixel_sha256: fingerprint, landmarks: validateLandmarks(data.landmarks) };
    if (data.hair_mask !== undefined) {
        if (!Array.isArray(data.hair_mask) || data.hair_mask.length !== image.width * image.height)
            throw new RangeError("Hair mask size does not match the photo.");
        out.hair_mask = data.hair_mask.map(value => number(value, 0, 1, "Hair coverage"));
    }
    if (data.observed_lashes !== undefined) {
        if (!Array.isArray(data.observed_lashes) || data.observed_lashes.length > MAX_TRACES)
            throw new RangeError("Too many lash observations.");
        out.observed_lashes = data.observed_lashes.map(validateTrace);
    }
    if (data.anatomy !== undefined)
        out.anatomy = validateAnatomy(data.anatomy);
    return out;
}
export function cloneImage(image) {
    validateImage(image);
    return { width: image.width, height: image.height, channels: 4, data: new Uint8ClampedArray(image.data) };
}
//# sourceMappingURL=input.js.map