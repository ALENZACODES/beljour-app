const MAX_FACES = 16;
function invalid(code, n) {
    return { index: null, code, visibleFaces: n, untouchedFaces: n };
}
function picked(index, code, n) {
    return { index, code, visibleFaces: n, untouchedFaces: n - 1 };
}
function normalize(box, width, height) {
    const values = [box.x, box.y, box.width, box.height, box.score];
    if (!values.every(Number.isFinite) || box.score < 0 || box.score > 1)
        return null;
    const x0 = Math.max(0, box.x / width), y0 = Math.max(0, box.y / height);
    const x1 = Math.min(1, (box.x + box.width) / width), y1 = Math.min(1, (box.y + box.height) / height);
    if (!(x1 > x0 && y1 > y0))
        return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, score: box.score };
}
export function makePicker(boxes, width, height, minConfidence = 0.7) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
        throw new RangeError("photo size must be positive integers");
    }
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
        throw new RangeError("detection confidence must be a finite fraction");
    }
    const tooMany = boxes.length > MAX_FACES;
    const filtered = tooMany ? [] : boxes.map((b) => normalize(b, width, height))
        .filter((b) => b !== null && b.score >= minConfidence);
    const count = filtered.length;
    const ranked = filtered.map((_, i) => i).sort((ia, ib) => {
        const a = filtered[ia], b = filtered[ib];
        const area = b.width * b.height - a.width * a.height;
        if (Math.abs(area) > 1e-12)
            return area;
        const da = (a.x + a.width / 2 - 0.5) ** 2 + (a.y + a.height / 2 - 0.5) ** 2;
        const db = (b.x + b.width / 2 - 0.5) ** 2 + (b.y + b.height / 2 - 0.5) ** 2;
        return da - db || a.x - b.x || a.y - b.y;
    });
    const primary = tooMany ? invalid("too_many_faces", boxes.length) :
        count ? picked(ranked[0], "selected_primary", count) : invalid("no_face_found", 0);
    const select = (index) => {
        if (!Number.isInteger(index) || index < 0 || index >= count)
            return invalid("invalid_selection", count);
        return picked(index, "selected_by_user", count);
    };
    const tap = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
            return invalid("invalid_tap", count);
        }
        const hits = filtered.map((b, i) => ({ b, i })).filter(({ b }) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
        if (!hits.length)
            return invalid("no_face_at_point", count);
        hits.sort((a, b) => (a.b.width * a.b.height - b.b.width * b.b.height) || a.i - b.i);
        return select(hits[0].i);
    };
    return { boxes: filtered, primary, tap, select };
}
export function composeFace(original, edited, chosen, bystanders, width, height, channels = 4) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
        original.length !== width * height * channels || edited.length !== original.length ||
        chosen.length !== width * height)
        throw new RangeError("invalid preview buffers");
    if (!chosen.some((x) => x > 0))
        throw new RangeError("verified chosen-person mask required");
    if (![chosen, ...bystanders].every((mask) => mask.length === width * height &&
        mask.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)))
        throw new RangeError("invalid region mask");
    const out = new Uint8ClampedArray(original);
    for (let pixel = 0; pixel < width * height; pixel++) {
        const allowed = bystanders.some((mask) => mask[pixel] > 0) ? 0 : chosen[pixel];
        if (!allowed)
            continue;
        const offset = pixel * channels;
        for (let c = 0; c < 3; c++) {
            out[offset + c] = Math.round(original[offset + c] * (1 - allowed) + edited[offset + c] * allowed);
        }
    }
    return out;
}
export function pickCounts(selection, verifiedMask, bystandersUnchanged) {
    return { code: selection.code, visibleFaces: selection.visibleFaces,
        untouchedFaces: selection.untouchedFaces, processed: selection.index !== null,
        verifiedMask, bystandersUnchanged };
}
