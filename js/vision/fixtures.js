import { hashModel } from "./model-registry.js";
export const FIXTURE_FORMAT = "beljour-vision-fixture/1";
const SHA = /^[0-9a-f]{64}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const NAME = /^[a-z][a-z0-9_-]{1,63}$/;
export class FixtureValidationError extends Error {
    constructor(msg) { super(msg); this.name = "FixtureValidationError"; }
}
const fail = (msg) => { throw new FixtureValidationError(msg); };
export function bytesToBase64(bytes) {
    // Chunking avoids spreading large arrays into a giant function argument.
    const parts = [];
    const stride = 16_384;
    for (let start = 0; start < bytes.length; start += stride) {
        const chunk = bytes.subarray(start, Math.min(start + stride, bytes.length));
        let text = "";
        for (const n of chunk)
            text += String.fromCharCode(n);
        parts.push(text);
    }
    return btoa(parts.join(""));
}
export function base64ToBytes(value) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        return fail("mask base64 is malformed");
    }
    try {
        const raw = atob(value);
        const result = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++)
            result[i] = raw.charCodeAt(i);
        if (bytesToBase64(result) !== value)
            return fail("mask base64 is not canonical");
        return result;
    }
    catch {
        return fail("mask base64 cannot be decoded");
    }
}
export async function encodeMask(name, mask) {
    if (!NAME.test(name) || mask.channels !== 1 || mask.width * mask.height !== mask.data.length) {
        return fail("invalid mask name or dimensions");
    }
    const data = new Uint8Array(mask.data.length);
    for (let i = 0; i < data.length; i++) {
        const value = mask.data[i];
        if (!Number.isFinite(value) || value < 0 || value > 1)
            return fail("mask alpha outside 0..1");
        data[i] = Math.round(value * 255);
    }
    return { name, width: mask.width, height: mask.height, encoding: "u8-base64",
        data: bytesToBase64(data), sha256: await hashModel(data.buffer) };
}
export async function decodeMask(fixture) {
    if (!NAME.test(fixture.name) || fixture.encoding !== "u8-base64" ||
        !Number.isInteger(fixture.width) || !Number.isInteger(fixture.height) ||
        fixture.width < 1 || fixture.height < 1 || fixture.width > 4096 || fixture.height > 4096 ||
        fixture.width * fixture.height > 4_194_304 || !SHA.test(fixture.sha256)) {
        return fail("invalid mask dimensions, name, encoding or digest");
    }
    const data = base64ToBytes(fixture.data);
    if (data.length !== fixture.width * fixture.height)
        return fail("mask byte length mismatch");
    if (await hashModel(new Uint8Array(data).buffer) !== fixture.sha256)
        return fail("mask checksum mismatch");
    return data;
}
function requireKeys(value, keys, name) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return fail(`${name} must be an object`);
    const actual = Object.keys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)))
        return fail(`${name} has missing or extra fields`);
    return value;
}
function requirePointArray(value, length, name) {
    if (!Array.isArray(value) || value.length !== length)
        return fail(`${name} must have ${length} points`);
    for (const coords of value) {
        if (!Array.isArray(coords) || coords.length !== 3 ||
            coords.some((number) => typeof number !== "number" || !Number.isFinite(number) || Math.abs(number) > 4)) {
            return fail(`${name} points must be finite [x,y,z] within +/-4`);
        }
    }
}
export async function validateFixture(value) {
    const data = requireKeys(value, ["format", "version", "source", "image", "faces", "pose", "masks"], "fixture");
    if (data.format !== FIXTURE_FORMAT || data.version !== 1)
        return fail("unknown fixture version");
    const source = requireKeys(data.source, ["releaseRef", "released", "captureMode", "author"], "source");
    if (source.released !== true || source.author !== "John Khan" || !REF.test(String(source.releaseRef ?? "")) ||
        (source.captureMode !== "manual" && source.captureMode !== "local-model")) {
        return fail("fixture requires an actual released photo and a safe release reference");
    }
    const image = requireKeys(data.image, ["sha256", "width", "height"], "image");
    if (typeof image.sha256 !== "string" || !SHA.test(image.sha256) ||
        !Number.isInteger(image.width) || !Number.isInteger(image.height) ||
        image.width < 1 || image.height < 1 ||
        image.width > 4096 || image.height > 4096 ||
        image.width * image.height > 4_194_304)
        return fail("invalid image hash or dimensions");
    if (!Array.isArray(data.faces) || data.faces.length > 6 || !Array.isArray(data.masks) || data.masks.length > 32) {
        return fail("fixture has too many faces or masks");
    }
    if (source.captureMode === "manual" && data.faces.length > 0)
        return fail("manual capture cannot manufacture 478 landmarks");
    const used = new Set();
    for (const faceValue of data.faces) {
        const face = requireKeys(faceValue, ["id", "landmarks", "blendshapes", "pose"], "face");
        if (typeof face.id !== "string" || !REF.test(face.id) || used.has(face.id))
            return fail("invalid face ID");
        used.add(face.id);
        requirePointArray(face.landmarks, 478, "face landmarks");
        const blend = face.blendshapes;
        if (!blend || typeof blend !== "object" || Array.isArray(blend) || Object.keys(blend).length > 100) {
            return fail("invalid blendshapes");
        }
        for (const [key, score] of Object.entries(blend)) {
            if (!NAME.test(key.toLowerCase()) || typeof score !== "number" || score < 0 || score > 1)
                return fail("invalid blendshape score");
        }
        const pose = requireKeys(face.pose, ["rollDegrees", "yawDegrees", "pitchDegrees", "interOcularDistance", "faceWidth", "confidence"], "head pose");
        if (pose.confidence !== "estimate")
            return fail("head pose is an estimate, not a medical measurement");
        for (const key of ["rollDegrees", "yawDegrees", "pitchDegrees"]) {
            if (typeof pose[key] !== "number" || !Number.isFinite(pose[key]) || Math.abs(pose[key]) > 90)
                return fail("invalid head pose angle");
        }
        for (const key of ["interOcularDistance", "faceWidth"]) {
            if (typeof pose[key] !== "number" || !Number.isFinite(pose[key]) || pose[key] < 0)
                return fail("invalid head size");
        }
    }
    const pose = requireKeys(data.pose, ["landmarks"], "pose");
    if (pose.landmarks !== null)
        requirePointArray(pose.landmarks, 33, "body pose");
    used.clear();
    for (const item of data.masks) {
        const layer = requireKeys(item, ["name", "width", "height", "encoding", "data", "sha256"], "mask");
        if (typeof layer.name !== "string" || used.has(layer.name) || layer.width !== image.width || layer.height !== image.height) {
            return fail("duplicate mask name or dimensions mismatch");
        }
        used.add(layer.name);
        await decodeMask(layer);
    }
    if (!(data.faces.length || data.masks.length || pose.landmarks))
        return fail("fixture needs one face, body pose or mask");
    return value;
}
export async function createFixture(input) {
    if (!input.released)
        return fail("a signed release is required before recording");
    const masks = await Promise.all((input.masks ?? []).map((item) => encodeMask(item.name, item.mask)));
    const result = {
        format: FIXTURE_FORMAT, version: 1,
        source: { releaseRef: input.releaseRef, released: true, captureMode: input.mode, author: "John Khan" },
        image: { sha256: input.imageHash, width: input.width, height: input.height },
        faces: (input.faces ?? []).map((face) => ({
            id: face.id, landmarks: face.landmarks.map((p) => [p.x, p.y, p.z]),
            blendshapes: face.blendshapes, pose: face.pose,
        })),
        pose: { landmarks: input.bodyPose ? input.bodyPose.map((p) => [p.x, p.y, p.z]) : null },
        masks,
    };
    return validateFixture(result);
}
//# sourceMappingURL=fixtures.js.map