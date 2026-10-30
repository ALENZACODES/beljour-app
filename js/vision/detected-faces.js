import { associated, meshBox, validMesh } from "./box-first.js";
import { makePicker } from "../save/face-picker.js";
export function fromDetection(result, width, height, minConfidence = 0.7) {
    if (!result || result.detector !== "yunet" || !Array.isArray(result.faces) || !Array.isArray(result.boxes)) {
        throw new RangeError("a box-first detector result is required");
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
        width > 16384 || height > 16384)
        throw new RangeError("invalid source photo dimensions");
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
        throw new RangeError("confidence must be a finite fraction");
    }
    const boxes = [];
    const observed = [];
    const indices = [];
    const claimed = new Set();
    result.faces.forEach((candidate, index) => {
        let mesh;
        try {
            mesh = validMesh(candidate);
        }
        catch {
            return;
        }
        const extent = meshBox(mesh, width, height);
        if (extent.width < 2 || extent.height < 2 || !Number.isFinite(extent.x) ||
            !Number.isFinite(extent.y))
            return;
        let score = 1;
        if (result.boxes.length) {
            const matches = result.boxes.map((box, i) => ({
                i, confidence: box.score, match: claimed.has(i) ? 0 : associated(mesh, box, width, height),
            })).filter(({ confidence, match }) => confidence >= minConfidence && match >= 0.15);
            matches.sort((a, b) => b.match - a.match || a.i - b.i);
            if (!matches.length)
                return;
            const selected = matches[0];
            score = selected.confidence;
            claimed.add(selected.i);
        }
        boxes.push({ x: extent.x, y: extent.y, width: extent.width, height: extent.height, score });
        observed.push(mesh);
        indices.push(index);
    });
    const picker = makePicker(boxes, width, height, minConfidence);
    return {
        picker, meshIndices: Object.freeze([...indices]),
        select: (index) => picker.select(index),
        tap: (x, y) => picker.tap(x, y),
        mesh: (selection) => {
            const i = selection.index;
            if (i === null || !Number.isInteger(i) || i < 0 || i >= observed.length ||
                !["selected_primary", "selected_by_user"].includes(selection.code))
                return null;
            return observed[i].map((p) => ({ ...p }));
        },
        counts: () => ({ code: picker.primary.code, visibleFaces: picker.primary.visibleFaces,
            untouchedFaces: picker.primary.untouchedFaces }),
    };
}
//# sourceMappingURL=detected-faces.js.map