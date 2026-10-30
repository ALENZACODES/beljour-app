/** Frames and borders, all drawn by code: a plain border, rounded corners, an instant-print card,
 * a film strip and a soft vignette. Each is named for a French place like the filter looks.
 *
 * `frameLayout` is the geometry: given the picture's pixel size it says how big the framed page
 * is and where the picture sits in it. On a single photo the border grows the page round the
 * photo, so the photo keeps every pixel; on a collage or story board (a fixed page size) the
 * frame is drawn inside the page and the board is laid out in what is left.
 * Thickness is a share of the picture's short side, in thousandths, so a frame looks the same at
 * any resolution.
 * Author: John Khan.
 */
import { PALETTE } from "../../ui/palette.js";
export const FRAMES = {
    orsay: { label: "Orsay", does: "A plain border in one colour" },
    luxembourg: { label: "Luxembourg", does: "Rounded corners" },
    deauville: { label: "Deauville", does: "An instant-print card with a deep bottom edge" },
    cannes: { label: "Cannes", does: "A film strip with sprocket holes" },
    giverny: { label: "Giverny", does: "A soft vignette fading to the frame colour" },
};
export const FRAME_IDS = Object.keys(FRAMES);
export const DEFAULT_FRAME = {
    orsay: { kind: "orsay", colour: PALETTE.cream, thickness: 40, radius: 0 },
    luxembourg: { kind: "luxembourg", colour: PALETTE.cream, thickness: 0, radius: 80 },
    deauville: { kind: "deauville", colour: PALETTE.surface, thickness: 50, radius: 0 },
    cannes: { kind: "cannes", colour: PALETTE.ink, thickness: 120, radius: 0 },
    giverny: { kind: "giverny", colour: PALETTE.cream, thickness: 220, radius: 0 },
};
export const MAX_THICKNESS = 300, MAX_RADIUS = 500;
export const INSTANT_BOTTOM = 3.6; // ASSUMED: an instant print's bottom edge is about 3.6 sides deep
export function checkFrame(f) {
    if (!(f.kind in FRAMES))
        throw new RangeError("Unknown frame");
    if (!/^#[0-9A-F]{6}$/.test(f.colour))
        throw new RangeError("A frame colour is #RRGGBB");
    if (!(f.thickness >= 0 && f.thickness <= MAX_THICKNESS))
        throw new RangeError("Frame thickness is out of range");
    if (!(f.radius >= 0 && f.radius <= MAX_RADIUS))
        throw new RangeError("Corner radius is out of range");
}
/** Margins (left, top, right, bottom) in pixels for a picture whose short side is `s`. */
function margins(f, s) {
    const t = Math.round(f.thickness / 1000 * s);
    if (f.kind === "orsay")
        return [t, t, t, t];
    if (f.kind === "deauville")
        return [t, t, t, Math.round(t * INSTANT_BOTTOM)];
    if (f.kind === "cannes") {
        const side = Math.round(t * 0.18);
        return [side, t, side, t];
    }
    return [0, 0, 0, 0];
}
function sprockets(f, page, top, bottom) {
    if (f.kind !== "cannes" || top < 4)
        return [];
    const hole = Math.max(2, Math.round(top * 0.42)), w = Math.max(2, Math.round(hole * 0.72)), gap = Math.round(w * 1.25);
    const count = Math.max(1, Math.floor((page.width - gap) / (w + gap)));
    const start = (page.width - (count * w + (count - 1) * gap)) / 2;
    const out = [];
    for (let i = 0; i < count; i++) {
        const x = Math.round(start + i * (w + gap));
        out.push({ x, y: Math.round((top - hole) / 2), width: w, height: hole });
        out.push({ x, y: Math.round(page.height - bottom + (bottom - hole) / 2), width: w, height: hole });
    }
    return out;
}
/** The framed page round a picture of `width` x `height` pixels. With `fixed`, the page stays that
 * size and the picture shrinks inside the frame instead. */
export function frameLayout(width, height, frame, fixed = false) {
    if (!(width >= 1 && height >= 1))
        throw new RangeError("A frame needs a picture size");
    if (!frame)
        return { width, height, picture: { x: 0, y: 0, width, height }, radius: 0, holes: [] };
    checkFrame(frame);
    const s = Math.min(width, height);
    const [l, t, r, b] = margins(frame, s);
    const radius = Math.round(frame.radius / 1000 * s / 2);
    if (fixed) {
        const picture = { x: l, y: t, width: Math.max(1, width - l - r), height: Math.max(1, height - t - b) };
        return { width, height, picture, radius, holes: sprockets(frame, { width, height }, t, b) };
    }
    const page = { width: width + l + r, height: height + t + b };
    return { ...page, picture: { x: l, y: t, width, height }, radius, holes: sprockets(frame, page, t, b) };
}
//# sourceMappingURL=frames.js.map