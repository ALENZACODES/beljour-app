/** Bounded, original guide drawings for the selected drawn figure in the continuous tour.
 * Five guides, each drawn only inside the selected figure's box: cheek
 * placement (concealer), optional masc or fem style cues (appearance), a
 * reference grid (ratio), a turning-direction marker (turn) and an alignment
 * plumb line (posture). They are diagrams on a drawn sample. They never infer
 * gender, anatomy, medical status or a score, and they do not run the
 * production engines that are unavailable in the tour.
 * Each guide needs its applied flag, local and face permissions and the
 * identity lock. Strength uses the visible 1.0..5.0 scale in 0.1 steps; 1.0 is
 * neutral and draws nothing. Compositing goes through the r26d pixel guard:
 * the edit ticket must match the current source revision and selected subject,
 * and every pixel outside the selected box, including any overlap with a
 * bystander, stays byte-identical. Any failure returns the unchanged original.
 * Author: John Khan.
 */
import { parseVisibleStrength } from "../strength-scale.js";
import { subjectEditDecision } from "../subjects/authority.js";
import { auditIsolatedSubject, composeIsolatedSubject, pixelFootprint, subjectIsolationPass, } from "../subjects/pixel-guard.js";
import { TOUR_THEME, requiredPermission } from "./contract.js";
export const GUIDE_EFFECTS = ["concealer", "appearance", "ratio", "turn", "posture"];
/** ASSUMED: the strongest guide (5.0) covers at most 60% over the drawing. */
export const MAX_GUIDE_OPACITY = 0.6;
/** ASSUMED: guide stroke width as a share of the selected box width (at least one pixel). */
export const STROKE_SHARE = 0.012;
/** ASSUMED: largest sideways shift of the turn meridian, as a share of the box width. */
export const TURN_SHIFT = 0.15;
const hex = (value) => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
/** ASSUMED: a warm neutral for the decorative cheek-placement diagram; not a complexion match. */
const CHEEK = [222, 184, 150];
const COLOURS = {
    concealer: CHEEK,
    appearance: hex(TOUR_THEME.red),
    ratio: hex(TOUR_THEME.blue),
    turn: hex(TOUR_THEME.blue),
    posture: hex(TOUR_THEME.blue),
};
/** 0 at the neutral 1.0, MAX_GUIDE_OPACITY at 5.0. */
export function guideOpacity(level) {
    return (parseVisibleStrength(level) - 1) / 4 * MAX_GUIDE_OPACITY;
}
/** Guides the current settings allow, in drawing order; neutral levels are left out. */
export function eligibleGuides(state) {
    if (!state.sourceLoaded || !state.identityLock || !state.permissions.local)
        return [];
    return GUIDE_EFFECTS.filter(effect => state.applied[effect] && state.permissions[requiredPermission(effect)] &&
        guideOpacity(state.levels[effect]) > 0 && (effect !== "appearance" || state.appearanceCue !== "none"));
}
/** Paints on a private copy, clipped to the selected footprint. Coordinates are box-relative 0..1. */
class BoxCanvas {
    rgba;
    width;
    box;
    stroke;
    constructor(rgba, width, box) {
        this.rgba = rgba;
        this.width = width;
        this.box = box;
        this.stroke = Math.max(1, Math.round((box.right - box.left) * STROKE_SHARE));
    }
    at([u, v]) {
        return [this.box.left + u * (this.box.right - this.box.left), this.box.top + v * (this.box.bottom - this.box.top)];
    }
    cover(minX, minY, maxX, maxY, colour, opacity, coverage) {
        const left = Math.max(this.box.left, Math.floor(minX)), right = Math.min(this.box.right, Math.ceil(maxX) + 1);
        const top = Math.max(this.box.top, Math.floor(minY)), bottom = Math.min(this.box.bottom, Math.ceil(maxY) + 1);
        for (let y = top; y < bottom; y += 1) {
            for (let x = left; x < right; x += 1) {
                const share = opacity * Math.max(0, Math.min(1, coverage(x + 0.5, y + 0.5)));
                if (share <= 0)
                    continue;
                const offset = (y * this.width + x) * 4;
                for (let c = 0; c < 3; c += 1) {
                    this.rgba[offset + c] = Math.round(this.rgba[offset + c] * (1 - share) + colour[c] * share);
                }
            }
        }
    }
    /** Antialiased segment of the stroke width. */
    line(from, to, colour, opacity) {
        const [ax, ay] = this.at(from), [bx, by] = this.at(to);
        const half = this.stroke / 2, dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
        this.cover(Math.min(ax, bx) - half - 1, Math.min(ay, by) - half - 1, Math.max(ax, bx) + half + 1, Math.max(ay, by) + half + 1, colour, opacity, (x, y) => {
            const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
            return half + 0.5 - Math.hypot(x - ax - t * dx, y - ay - t * dy);
        });
    }
    polyline(points, colour, opacity) {
        for (let i = 1; i < points.length; i += 1)
            this.line(points[i - 1], points[i], colour, opacity);
    }
    /** Soft disc whose coverage falls linearly from the centre; radius is a share of the box width. */
    disc(centre, radius, colour, opacity) {
        const [cx, cy] = this.at(centre);
        const r = Math.max(1, radius * (this.box.right - this.box.left));
        this.cover(cx - r, cy - r, cx + r, cy + r, colour, opacity, (x, y) => 1 - Math.hypot(x - cx, y - cy) / r);
    }
}
/** Points along an elliptical arc in box coordinates, angles in degrees. */
function arc(centre, rx, ry, from, to, steps = 12) {
    return Array.from({ length: steps + 1 }, (_, i) => {
        const angle = (from + (to - from) * i / steps) * Math.PI / 180;
        return [centre[0] + rx * Math.cos(angle), centre[1] + ry * Math.sin(angle)];
    });
}
function drawGuide(canvas, effect, state) {
    const colour = COLOURS[effect];
    const opacity = guideOpacity(state.levels[effect]);
    if (effect === "concealer") {
        canvas.disc([0.3, 0.62], 0.09, colour, opacity);
        canvas.disc([0.7, 0.62], 0.09, colour, opacity);
    }
    else if (effect === "appearance" && state.appearanceCue === "masc") {
        canvas.line([0.26, 0.36], [0.44, 0.33], colour, opacity);
        canvas.line([0.56, 0.33], [0.74, 0.36], colour, opacity);
        canvas.polyline([[0.2, 0.7], [0.36, 0.9], [0.64, 0.9], [0.8, 0.7]], colour, opacity);
    }
    else if (effect === "appearance" && state.appearanceCue === "fem") {
        canvas.polyline(arc([0.35, 0.36], 0.09, 0.04, 200, 340), colour, opacity);
        canvas.polyline(arc([0.65, 0.36], 0.09, 0.04, 200, 340), colour, opacity);
        canvas.polyline(arc([0.5, 0.78], 0.12, 0.05, 20, 160), colour, opacity);
    }
    else if (effect === "ratio") {
        for (const u of [0.2, 0.4, 0.6, 0.8])
            canvas.line([u, 0], [u, 1], colour, opacity);
        for (const v of [1 / 3, 2 / 3])
            canvas.line([0, v], [1, v], colour, opacity);
    }
    else if (effect === "turn") {
        // ASSUMED direction: the tour has no left/right control, so the guide turns toward the viewer's right.
        const shift = TURN_SHIFT * (parseVisibleStrength(state.levels.turn) - 1) / 4;
        canvas.polyline(arc([0.38 + shift, 0.5], 0.12, 0.42, -90, 90), colour, opacity);
        canvas.line([0.5, 0.5], [0.5 + 0.2 + shift, 0.5], colour, opacity);
        canvas.polyline([[0.62 + shift, 0.44], [0.7 + shift, 0.5], [0.62 + shift, 0.56]], colour, opacity);
    }
    else if (effect === "posture") {
        canvas.line([0.5, 0.02], [0.5, 0.98], colour, opacity);
        canvas.line([0.15, 0.92], [0.85, 0.92], colour, opacity);
    }
}
function unchanged(original, note) {
    return {
        frame: { width: original.width, height: original.height, rgba: new Uint8ClampedArray(original.rgba) },
        visual: "original", painted: [], protectedBystanders: false, metrics: null, note,
    };
}
/** Draw the eligible guides for the selected subject, or return the original unchanged. */
export function paintTourGuides(original, state, subjects) {
    const decision = subjectEditDecision(subjects);
    const ticket = decision.ticket;
    if (!decision.allowed || !ticket || !state.identityLock) {
        return unchanged(original, "No checked active subject and identity lock. Drawing unchanged.");
    }
    if (ticket.photoRevision !== state.sourceRevision || ticket.selectedId !== state.selectedId) {
        return unchanged(original, "The drawing or selection changed. Drawing unchanged.");
    }
    const guides = eligibleGuides(state);
    if (!guides.length)
        return unchanged(original, "No guide is applied above the neutral 1.0. Drawing unchanged.");
    let proposed = null;
    try {
        proposed = new Uint8ClampedArray(original.rgba);
        const canvas = new BoxCanvas(proposed, original.width, pixelFootprint(ticket.target, original.width, original.height));
        for (const effect of guides)
            drawGuide(canvas, effect, state);
        const candidate = { width: original.width, height: original.height, rgba: proposed };
        const isolated = composeIsolatedSubject(original, candidate, ticket, subjects);
        const audit = auditIsolatedSubject(original, isolated.frame, ticket, subjects);
        if (!subjectIsolationPass(audit))
            throw new Error("Guide pixels reached a protected area");
        return {
            frame: isolated.frame, visual: "guides", painted: guides, protectedBystanders: true,
            metrics: isolated.metrics,
            note: "Illustrative guides on the selected drawn figure only; bystanders are preserved byte-for-byte.",
        };
    }
    catch {
        return unchanged(original, "Guide isolation was unavailable. Original shown unchanged.");
    }
    finally {
        proposed?.fill(0);
    }
}
/** Paint guides onto a Canvas that already shows the drawn sample. */
export function paintGuidesOnCanvas(target, state, subjects) {
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context)
        throw new Error("Canvas not available");
    const image = context.getImageData(0, 0, target.width, target.height);
    const result = paintTourGuides({ width: target.width, height: target.height, rgba: image.data }, state, subjects);
    if (result.visual === "guides") {
        image.data.set(result.frame.rgba);
        context.putImageData(image, 0, 0);
    }
    return result;
}
//# sourceMappingURL=guide-painter.js.map