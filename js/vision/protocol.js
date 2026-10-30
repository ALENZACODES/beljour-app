const OPERATIONS = ["face-detection", "face-landmarks", "pose", "hair-segmentation", "person-segmentation"];
export function requireVisionRequest(input) {
    if (!input || typeof input !== "object")
        throw new RangeError("vision request must be an object");
    const v = input;
    if (v.kind !== "detect" || !Number.isSafeInteger(v.id) || (v.id ?? -1) < 1 ||
        !OPERATIONS.includes(v.operation))
        throw new RangeError("invalid vision message kind, id or operation");
    const im = v.image;
    if (!im || !Number.isInteger(im.width) || !Number.isInteger(im.height) ||
        (im.width ?? 0) < 1 || (im.height ?? 0) < 1 ||
        (im.width ?? 0) > 4096 || (im.height ?? 0) > 4096 ||
        !(im.rgba instanceof ArrayBuffer) || im.rgba.byteLength !== im.width * im.height * 4) {
        throw new RangeError("worker input must be a complete <=4096px RGBA image");
    }
    if (v.maxFaces !== undefined && (!Number.isInteger(v.maxFaces) || v.maxFaces < 1 || v.maxFaces > 6)) {
        throw new RangeError("face limit must be 1..6");
    }
    return v;
}
export function transferResponse(out) {
    if (!out.ok)
        return [];
    const seg = out.output.segmentation;
    if (!seg)
        return [];
    return [...seg.channels.map((c) => c.buffer),
        ...(seg.categoryMask ? [seg.categoryMask.buffer] : [])];
}
//# sourceMappingURL=protocol.js.map