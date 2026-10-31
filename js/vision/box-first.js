import { roundHalfEven } from "../engines/core/buffer.js";
const createNativeImage = (data, width, height) => new ImageData(new Uint8ClampedArray(data), width, height);
export function validateImage(image) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) ||
        image.width < 2 || image.height < 2 || image.width > 16384 || image.height > 16384 ||
        !(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) {
        throw new RangeError("box-first detection requires complete 2..16384px RGBA");
    }
}
export function validMesh(value) {
    if (!Array.isArray(value) || value.length !== 478 || value.some((p) => !p ||
        ![p.x, p.y, p.z].every(Number.isFinite)))
        throw new RangeError("a finite 478-point XYZ mesh is required");
    const xs = value.map((p) => p.x), ys = value.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= 1e-7 || Math.max(...ys) - Math.min(...ys) <= 1e-7) {
        throw new RangeError("mesh has no area");
    }
    return value.map(({ x, y, z }) => ({ x, y, z }));
}
export function overlap(a, b) {
    const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const intersection = width * height, union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
}
export function prepareBoxes(raw, width, height, limit = 6, minScore = 0.7) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 6)
        throw new RangeError("face limit must be 1..6");
    if (![width, height].every((v) => Number.isInteger(v) && v >= 2 && v <= 16384))
        throw new RangeError("invalid image size");
    if (!(Number.isFinite(minScore) && minScore >= 0 && minScore <= 1))
        throw new RangeError("score threshold must be 0..1");
    const candidates = [];
    for (const row of raw) {
        if (![4, 5, 15].includes(row.length) || !Array.from(row).every(Number.isFinite))
            continue;
        const [x, y, width0, height0] = row, score = row.length === 4 ? 1 : row.at(-1);
        if (width0 <= 0 || height0 <= 0 || score < minScore || score > 1)
            continue;
        const left = Math.max(0, x), top = Math.max(0, y);
        const right = Math.min(width, x + width0), bottom = Math.min(height, y + height0);
        if (right - left < 2 || bottom - top < 2)
            continue;
        candidates.push({ x: left, y: top, width: right - left, height: bottom - top, score });
    }
    candidates.sort((a, b) => b.score - a.score || b.width * b.height - a.width * a.height || a.x - b.x || a.y - b.y);
    const kept = [];
    for (const candidate of candidates) {
        if (kept.every((previous) => overlap(candidate, previous) <= 0.3))
            kept.push(candidate);
        if (kept.length === limit)
            break;
    }
    return kept;
}
export function cropPlan(box, margin = 1.6, minimum = 256, maximum = 512) {
    if (![box.x, box.y, box.width, box.height, box.score].every(Number.isFinite) || box.width <= 0 || box.height <= 0 ||
        box.score < 0 || box.score > 1) {
        throw new RangeError("crop needs a finite positive box");
    }
    if (!(Number.isFinite(margin) && margin >= 1 && margin <= 3))
        throw new RangeError("crop margin must be 1..3");
    if (!(Number.isInteger(minimum) && Number.isInteger(maximum) && minimum >= 32 && minimum <= maximum && maximum <= 1024)) {
        throw new RangeError("invalid crop resolution budget");
    }
    const side = Math.max(2, Math.ceil(Math.max(box.width, box.height) * margin));
    if (side > 32768)
        throw new RangeError("crop exceeds memory budget");
    return { left: Math.floor(box.x + box.width / 2 - side / 2), top: Math.floor(box.y + box.height / 2 - side / 2),
        side, outputSize: Math.min(maximum, Math.max(minimum, side)) };
}
/** Bilinear square crop with edge replication; no large padded source allocation. */
export function cropImage(image, crop, createImage = createNativeImage) {
    validateImage(image);
    validateCrop(crop);
    const size = crop.outputSize, data = new Uint8ClampedArray(size * size * 4);
    const read = (x, y, channel) => {
        const px = Math.max(0, Math.min(image.width - 1, x)), py = Math.max(0, Math.min(image.height - 1, y));
        return image.data[(py * image.width + px) * 4 + channel];
    };
    for (let y = 0; y < size; y++) {
        const sy = Math.max(0, Math.min(crop.side - 1, (y + 0.5) * crop.side / size - 0.5)) + crop.top;
        const y0 = Math.floor(sy), fy = sy - y0;
        for (let x = 0; x < size; x++) {
            const sx = Math.max(0, Math.min(crop.side - 1, (x + 0.5) * crop.side / size - 0.5)) + crop.left;
            const x0 = Math.floor(sx), fx = sx - x0;
            for (let c = 0; c < 4; c++) {
                const upper = read(x0, y0, c) * (1 - fx) + read(x0 + 1, y0, c) * fx;
                const lower = read(x0, y0 + 1, c) * (1 - fx) + read(x0 + 1, y0 + 1, c) * fx;
                data[(y * size + x) * 4 + c] = roundHalfEven(upper * (1 - fy) + lower * fy);
            }
        }
    }
    return createImage(data, size, size);
}
function validateCrop(crop) {
    if (![crop.left, crop.top, crop.side, crop.outputSize].every(Number.isInteger) || crop.side < 2 ||
        crop.side > 32768 || crop.outputSize < 32 || crop.outputSize > 1024)
        throw new RangeError("invalid crop plan");
}
export function restoreMesh(points, crop, width, height) {
    validateCrop(crop);
    if (![width, height].every((v) => Number.isInteger(v) && v >= 2))
        throw new RangeError("invalid image size");
    // Both depth and horizontal coordinates use the crop's width. Y uses its height.
    // Padded origins are retained, including negative left/top; clipping here would
    // conceal a failed detection at the image border.
    return validMesh(points).map(({ x, y, z }) => ({
        x: (crop.left + x * crop.side) / width,
        y: (crop.top + y * crop.side) / height,
        z: z * crop.side / width,
    }));
}
export function meshBox(points, width, height) {
    const xs = points.map((p) => p.x * width), ys = points.map((p) => p.y * height);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, score: 1 };
}
export function associated(points, box, width, height) {
    const candidate = meshBox(points, width, height);
    const cx = candidate.x + candidate.width / 2, cy = candidate.y + candidate.height / 2;
    if (cx < box.x - box.width * 0.1 || cx > box.x + box.width * 1.1 ||
        cy < box.y - box.height * 0.1 || cy > box.y + box.height * 1.1)
        return 0;
    return overlap(candidate, box);
}
function isDuplicate(points, kept, width, height) {
    const box = meshBox(points, width, height);
    return kept.some((other) => overlap(box, meshBox(other, width, height)) > 0.6);
}
export class BoxFirstDetector {
    source;
    meshes;
    maxFaces;
    createImage;
    constructor(source, meshes, maxFaces = 6, createImage = createNativeImage) {
        this.source = source;
        this.meshes = meshes;
        this.maxFaces = maxFaces;
        this.createImage = createImage;
        if (source.provider !== "yunet")
            throw new RangeError("box-first source must identify the YuNet runtime");
        if (!Number.isInteger(maxFaces) || maxFaces < 1 || maxFaces > 6)
            throw new RangeError("face limit must be 1..6");
    }
    async detect(image) {
        validateImage(image);
        const { width, height } = image;
        const result = { faces: [], blendshapes: [], attempts: [], usedFallback: false,
            detector: "yunet", boxes: prepareBoxes(await this.source.detect(image), width, height, this.maxFaces) };
        const unresolved = [];
        for (const box of result.boxes) {
            let matched = false;
            for (const margin of [1.6, 2.0]) {
                const plan = cropPlan(box, margin), raw = await this.meshes(cropImage(image, plan, this.createImage));
                let invalid = 0;
                const choices = [];
                raw.faces.forEach((points, i) => {
                    let restored;
                    try {
                        restored = restoreMesh(points, plan, width, height);
                    }
                    catch {
                        invalid++;
                        return;
                    }
                    const score = associated(restored, box, width, height);
                    if (score >= 0.15)
                        choices.push({ score, points: restored, blend: raw.blendshapes[i] ?? {} });
                });
                result.attempts.push({ stage: "crop", margin, size: plan.outputSize, rawMeshes: raw.faces.length,
                    invalidMeshes: invalid, matched: choices.length > 0 });
                choices.sort((a, b) => b.score - a.score);
                if (choices.length) {
                    const selected = choices[0];
                    if (!isDuplicate(selected.points, result.faces, width, height)) {
                        result.faces.push(selected.points);
                        result.blendshapes.push(selected.blend);
                    }
                    matched = true;
                    break;
                }
            }
            if (!matched)
                unresolved.push(box);
        }
        if (unresolved.length || !result.boxes.length) {
            result.usedFallback = true;
            const raw = await this.meshes(image);
            let matched = 0;
            for (let i = 0; i < raw.faces.length; i++) {
                let points;
                try {
                    points = validMesh(raw.faces[i]);
                }
                catch {
                    continue;
                }
                if (result.boxes.length && !unresolved.some((box) => associated(points, box, width, height) >= 0.15))
                    continue;
                if (isDuplicate(points, result.faces, width, height))
                    continue;
                if (result.faces.length === this.maxFaces)
                    break;
                result.faces.push(points);
                result.blendshapes.push(raw.blendshapes[i] ?? {});
                matched++;
            }
            result.attempts.push({ stage: "full_image_fallback", rawMeshes: raw.faces.length, matched: matched > 0 });
        }
        return result;
    }
}
/** Adapter for an already-cleared native YuNet binding returning OpenCV's Nx15 rows.
 * It deliberately does not decode arbitrary ONNX tensors or claim a model is cleared.
 */
export class YuNetRowsAdapter {
    infer;
    dispose;
    provider = "yunet";
    constructor(infer, dispose) {
        this.infer = infer;
        this.dispose = dispose;
    }
    detect(image) {
        validateImage(image);
        return this.infer(image);
    }
    close() { return this.dispose?.(); }
}
export function sizeSlice(pixels) {
    if (pixels === null || !Number.isFinite(pixels) || pixels <= 0)
        return "unknown";
    return pixels < 64 ? "small_lt64" : pixels < 128 ? "medium_64_127" : "large_ge128";
}
export function yawSlice(degrees) {
    if (degrees === null || !Number.isFinite(degrees))
        return "unknown";
    const yaw = Math.abs(degrees);
    return yaw <= 15 ? "frontal" : yaw < 45 ? "angled" : yaw < 75 ? "side" : "profile";
}
