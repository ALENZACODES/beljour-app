export function finitePoints(points, count = 478) {
    if (!Array.isArray(points) || points.length !== count)
        throw new RangeError(`expected ${count} landmarks`);
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) {
        throw new RangeError("landmark coordinates must be finite");
    }
}
function diff(a, b, aspect) {
    return { x: (a.x - b.x) * aspect, y: a.y - b.y, z: a.z * aspect - b.z * aspect };
}
function size(v) { return Math.hypot(v.x, v.y, v.z); }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function norm(a) {
    const n = size(a);
    if (n < 1e-7)
        throw new RangeError("degenerate face pose landmarks");
    return { x: a.x / n, y: a.y / n, z: a.z / n };
}
/** Build orthogonal face axes from eyes, brow and chin; z is MediaPipe's relative
 * face depth, scaled by image width. The 478-point requirement avoids treating
 * an older 468 mesh as a refined mesh. Orientation is never a diagnosis. */
export function headPoseFromMesh(points, imageWidth, imageHeight) {
    finitePoints(points);
    if (!(Number.isFinite(imageWidth) && Number.isFinite(imageHeight) && imageWidth > 0 && imageHeight > 0)) {
        throw new RangeError("head pose needs positive image dimensions");
    }
    const aspect = imageWidth / imageHeight;
    const eyes = diff(points[263], points[33], aspect);
    const foreheadToChin = diff(points[152], points[10], aspect);
    let right = norm(eyes);
    // Gram-Schmidt removes the eye-axis component to form a stable vertical axis.
    const projected = dot(right, foreheadToChin);
    let down = norm({ x: foreheadToChin.x - projected * right.x,
        y: foreheadToChin.y - projected * right.y,
        z: foreheadToChin.z - projected * right.z });
    // Check the face width against a second horizontal pair; wrong/corrupt
    // landmark indices must not produce a plausible-looking angle.
    const width = size(diff(points[454], points[234], aspect));
    const iod = size(eyes);
    if (width < 0.03 || iod < 0.015 || width < iod * 0.8) {
        throw new RangeError("face too small or degenerate for head pose");
    }
    const forward = norm(cross(right, down));
    down = norm(cross(forward, right));
    right = norm(cross(down, forward));
    const rad = 180 / Math.PI;
    const clamp = (degrees) => Math.max(-89.9, Math.min(89.9, degrees));
    return {
        rollDegrees: clamp(Math.atan2(right.y, right.x) * rad),
        yawDegrees: clamp(Math.atan2(-right.z, right.x) * rad),
        pitchDegrees: clamp(Math.atan2(down.z, down.y) * rad),
        interOcularDistance: iod, faceWidth: width, confidence: "estimate",
    };
}
export function boundsFromMesh(points) {
    finitePoints(points);
    // MediaPipe may return slight out-of-image coordinates; preserve them rather
    // than clipping the selected person's face for mask operations.
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const p of points) {
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
        top = Math.min(top, p.y);
        bottom = Math.max(bottom, p.y);
    }
    if (!(right > left && bottom > top))
        throw new RangeError("zero size face");
    return { left, top, right, bottom };
}
export function faceCentroid(bounds) {
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
}
export function faceArea(bounds) {
    return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
}
export function boxIoU(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const shared = width * height;
    const whole = faceArea(a) + faceArea(b) - shared;
    return whole > 0 ? shared / whole : 0;
}
export function selectFace(faces, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
        return null;
    if (!faces.length)
        return null;
    const contains = faces.filter((f) => x >= f.bounds.left && x <= f.bounds.right &&
        y >= f.bounds.top && y <= f.bounds.bottom);
    // Overlapping faces: the more specific (smaller) bounding box wins.
    const candidates = contains.length ? contains : faces;
    return candidates.slice().sort((a, b) => {
        if (contains.length)
            return faceArea(a.bounds) - faceArea(b.bounds);
        const ca = faceCentroid(a.bounds), cb = faceCentroid(b.bounds);
        const da = (ca.x - x) ** 2 + (ca.y - y) ** 2;
        const db = (cb.x - x) ** 2 + (cb.y - y) ** 2;
        return da - db || a.id.localeCompare(b.id);
    })[0] ?? null;
}
/** Assign stable IDs across frames by pairing overlapping boxes. New IDs are
 * monotonically numbered, and a crossing pair cannot be matched twice. */
export class FaceTracker {
    previous = [];
    nextId = 1;
    assign(readings) {
        const edges = readings.flatMap((face, i) => this.previous.map((prior, j) => ({ i, j, score: boxIoU(face.bounds, prior.bounds) })));
        edges.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
        const takenNew = new Set(), takenOld = new Set(), names = new Array(readings.length);
        for (const edge of edges) {
            if (edge.score < 0.20)
                break;
            if (takenNew.has(edge.i) || takenOld.has(edge.j))
                continue;
            names[edge.i] = this.previous[edge.j].id;
            takenNew.add(edge.i);
            takenOld.add(edge.j);
        }
        const faces = readings.map((face, i) => ({ ...face, id: names[i] ?? `face-${this.nextId++}` }));
        this.previous = faces.map(({ id, bounds }) => ({ id, bounds }));
        return faces;
    }
    reset() { this.previous = []; this.nextId = 1; }
}
/** Re-check and attach derived head pose to every face before local engines use
 * it. Invalid individual faces are discarded, not allowed to abort the group. */
export function normaliseFaces(raw, width, height, tracker, limit = 6) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 6)
        throw new RangeError("face limit must be 1..6");
    const valid = [];
    for (const face of raw.slice(0, limit)) {
        try {
            const pose = headPoseFromMesh(face.landmarks, width, height);
            valid.push({ landmarks: face.landmarks, bounds: boundsFromMesh(face.landmarks), pose,
                blendshapes: face.blendshapes ?? {} });
        }
        catch { /* bad single face must not discard good faces */ }
    }
    return tracker.assign(valid);
}
//# sourceMappingURL=geometry.js.map