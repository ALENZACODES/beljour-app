import { ellipse, coverage } from "../../engines/core/mask.js";
import { FRONT, SIDE, makeControls } from "../../engines/local/posture.js";
import { approximatePerson } from "../../engines/local/figures.js";
import { PHOTO_MARK } from "../palette.js";
/** Convert a pointer from the CSS-scaled, possibly scrolled canvas to image pixels. */
export function pointFromScreen(rect, imageWidth, imageHeight, x, y) {
    if (![rect.left, rect.top, rect.width, rect.height, imageWidth, imageHeight, x, y].every(Number.isFinite) ||
        rect.width <= 0 || rect.height <= 0 || imageWidth < 8 || imageHeight < 8) {
        throw new RangeError("The photo is not ready for marking");
    }
    const fx = (x - rect.left) / rect.width;
    const fy = (y - rect.top) / rect.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1)
        throw new RangeError("Marking must be inside the photo");
    return [Math.max(0, Math.min(imageWidth - 1, fx * (imageWidth - 1))),
        Math.max(0, Math.min(imageHeight - 1, fy * (imageHeight - 1)))];
}
export class AnnotationDraft {
    kind;
    width;
    height;
    view;
    facing;
    marks = [];
    names;
    constructor(kind, width, height, view = "front", facing = 1) {
        this.kind = kind;
        this.width = width;
        this.height = height;
        this.view = view;
        this.facing = facing;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 ||
            width * height > 2048 * 2048)
            throw new RangeError("The photo must be 64–2048 pixels per side");
        if (kind !== "crown" && kind !== "body")
            throw new RangeError("Unknown marking type");
        if (view !== "front" && view !== "side")
            throw new RangeError("Use front or side body view");
        if (facing !== -1 && facing !== 1)
            throw new RangeError("Use an image-left or image-right facing direction");
        this.names = kind === "crown" ? ["Crown top-left", "Crown bottom-right"] : view === "front" ? FRONT : SIDE;
    }
    get points() { return this.marks.map((p) => [...p]); }
    get progress() { return this.marks.length; }
    get required() { return this.names.length; }
    get ready() { return this.progress === this.required; }
    get next() { return this.names[this.marks.length] ?? "All points marked — check then apply"; }
    get instructions() {
        if (this.kind === "crown")
            return this.next === this.names[0]
                ? "Tap the upper-left of the thinning area, not the whole head."
                : this.next === this.names[1] ? "Tap its lower-right; you can undo any point." : "Check the oval then use this area.";
        return this.ready ? "Manual landmarks only; your person mask will be approximated from these points."
            : `Tap ${this.next.replaceAll("_", " ")} on the person (point ${this.progress + 1} of ${this.required}).`;
    }
    add(point) {
        if (this.ready)
            throw new RangeError("All points are already marked; undo before changing a mark");
        if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) ||
            point[0] < 0 || point[1] < 0 || point[0] > this.width - 1 || point[1] > this.height - 1) {
            throw new RangeError("Marking lies outside the image");
        }
        this.marks.push([point[0], point[1]]);
    }
    undo() { return this.marks.pop() ?? null; }
    clear() { this.marks = []; }
    restart(view = this.view, facing = this.facing) {
        return new AnnotationDraft(this.kind, this.width, this.height, view, facing);
    }
    /** Explicitly require all points; never fabricate an unmarked body/face. */
    seal() {
        if (!this.ready)
            throw new RangeError(`Mark ${this.required - this.progress} more point(s)`);
        if (this.kind === "crown") {
            const [a, b] = this.marks;
            const left = Math.min(a[0], b[0]), top = Math.min(a[1], b[1]);
            const right = Math.max(a[0], b[0]), bottom = Math.max(a[1], b[1]);
            if (right - left < 12 || bottom - top < 12)
                throw new RangeError("Select an oval at least 12 pixels across");
            const mask = ellipse(this.width, this.height, (left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, 0.025);
            const share = coverage(mask) * 100;
            if (share < 0.2 || share > 65)
                throw new RangeError("Crown selection is too small or too broad");
            return { kind: "crown", mask, areaPercent: share };
        }
        const landmarks = {};
        this.names.forEach((name, i) => { landmarks[name] = this.marks[i]; });
        const facing = this.view === "front" ? 0 : this.facing;
        const controls = makeControls(this.view, landmarks, this.width, this.height, facing, [], this.names);
        const mask = approximatePerson(controls);
        const share = coverage(mask) * 100;
        if (!(share >= 0.2 && share <= 95))
            throw new RangeError("The approximate person area is outside usable bounds");
        return { kind: "body", controls, mask, areaPercent: share };
    }
}
/** Stroke one path twice: a wide cream halo, then the thin plum core on top. */
function twoTone(ctx, core, path) {
    ctx.lineWidth = core * 2.6;
    ctx.strokeStyle = PHOTO_MARK.halo;
    ctx.beginPath();
    path();
    ctx.stroke();
    ctx.lineWidth = core;
    ctx.strokeStyle = PHOTO_MARK.core;
    ctx.beginPath();
    path();
    ctx.stroke();
}
/** UI overlay is not part of the exported photo; its role is precise placement. Every mark is
 * two-tone (ui/palette.ts PHOTO_MARK) so it stays visible from very fair to very deep skin. */
export function drawMarks(canvas, draft) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("Canvas is unavailable");
    ctx.save();
    const core = Math.max(1.5, Math.min(canvas.width, canvas.height) / 170);
    ctx.lineJoin = "round";
    ctx.font = `600 ${Math.max(10, canvas.width / 40)}px system-ui, sans-serif`;
    const marks = draft.points;
    if (draft.kind === "crown" && marks.length === 2) {
        const [a, b] = marks;
        ctx.setLineDash([6, 3]);
        twoTone(ctx, core, () => ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(a[0] - b[0]) / 2, Math.abs(a[1] - b[1]) / 2, 0, 0, Math.PI * 2));
        ctx.setLineDash([]);
    }
    if (draft.kind === "body" && marks.length > 1) {
        const edges = draft.view === "front"
            ? [[0, 1], [2, 3], [0, 2], [1, 3], [4, 5]]
            : [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]];
        for (const [a, b] of edges) {
            if (!marks[a] || !marks[b])
                continue;
            twoTone(ctx, core, () => { ctx.moveTo(...marks[a]); ctx.lineTo(...marks[b]); });
        }
    }
    marks.forEach(([x, y], i) => {
        ctx.fillStyle = PHOTO_MARK.halo;
        ctx.strokeStyle = PHOTO_MARK.core;
        ctx.lineWidth = core;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(4, canvas.width / 90), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const label = String(i + 1), lx = x + 6, ly = Math.max(12, y - 6);
        ctx.lineWidth = core * 2;
        ctx.strokeStyle = PHOTO_MARK.halo;
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = PHOTO_MARK.core;
        ctx.fillText(label, lx, ly);
    });
    ctx.restore();
}
//# sourceMappingURL=annotations.js.map