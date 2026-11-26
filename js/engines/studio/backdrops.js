/** Procedural studio backdrops: thirty named backdrops drawn by code at any size, a vertical
 * gradient with an optional soft light spot and mottled-canvas texture. No photograph or
 * generated location. Mirrors api/plumb_api/engines/studio/backdrops.py. Author: John Khan.
 */
import { hashNoise, radiusFor, softBlur } from "./common.js";
export const SPOT_CENTRE = [0.5, 0.38];
const ROWS = [
    ["chinon", "Chinon slate", "Classic", [74, 82, 92], [52, 58, 66], 0.12, 0.0],
    ["saumur", "Saumur stone", "Classic", [196, 190, 180], [168, 162, 152], 0.08, 0.0],
    ["angers", "Angers charcoal", "Classic", [58, 58, 60], [36, 36, 38], 0.14, 0.0],
    ["blois", "Blois dove grey", "Classic", [178, 180, 182], [150, 152, 155], 0.10, 0.0],
    ["bourges", "Bourges navy", "Classic", [40, 52, 78], [26, 34, 54], 0.12, 0.0],
    ["beaune", "Beaune wine", "Classic", [96, 44, 52], [66, 30, 36], 0.10, 0.0],
    ["chablis", "Chablis ivory", "Light", [236, 230, 216], [214, 206, 190], 0.06, 0.0],
    ["vitre", "Vitré chalk", "Light", [232, 233, 230], [208, 210, 207], 0.05, 0.0],
    ["dinan", "Dinan mist", "Light", [210, 218, 222], [184, 194, 200], 0.08, 0.0],
    ["pornic", "Pornic sand", "Light", [222, 206, 182], [196, 178, 152], 0.08, 0.0],
    ["evian", "Évian water", "Light", [200, 220, 226], [170, 194, 204], 0.08, 0.0],
    ["auray", "Auray blush", "Light", [232, 210, 204], [208, 182, 176], 0.06, 0.0],
    ["cahors", "Cahors canvas", "Painted", [104, 86, 70], [72, 58, 46], 0.10, 0.10],
    ["figeac", "Figeac umber", "Painted", [122, 96, 72], [84, 64, 48], 0.12, 0.12],
    ["moissac", "Moissac olive", "Painted", [96, 100, 76], [66, 70, 52], 0.10, 0.10],
    ["rodez", "Rodez storm", "Painted", [92, 98, 108], [60, 64, 72], 0.12, 0.12],
    ["millau", "Millau teal", "Painted", [58, 92, 96], [38, 62, 66], 0.12, 0.10],
    ["auch", "Auch ochre", "Painted", [168, 132, 84], [128, 98, 60], 0.08, 0.10],
    ["quimper", "Quimper blue", "Colour", [66, 98, 150], [44, 68, 108], 0.14, 0.0],
    ["morlaix", "Morlaix sage", "Colour", [148, 166, 146], [118, 136, 116], 0.10, 0.0],
    ["lannion", "Lannion coral", "Colour", [214, 128, 112], [182, 98, 84], 0.08, 0.0],
    ["paimpol", "Paimpol sea", "Colour", [70, 128, 138], [46, 96, 106], 0.12, 0.0],
    ["vannes", "Vannes lilac", "Colour", [170, 150, 186], [138, 118, 156], 0.08, 0.0],
    ["niort", "Niort moss", "Colour", [82, 108, 70], [56, 78, 46], 0.10, 0.0],
    ["loches", "Loches terracotta", "Colour", [170, 96, 70], [136, 70, 50], 0.10, 0.0],
    ["gien", "Gien mustard", "Colour", [200, 160, 70], [168, 128, 48], 0.08, 0.0],
    ["auxerre", "Auxerre dusk", "Evening", [62, 58, 84], [30, 28, 44], 0.18, 0.0],
    ["arbois", "Arbois ember", "Evening", [92, 52, 40], [40, 22, 18], 0.20, 0.0],
    ["briancon", "Briançon night", "Evening", [34, 44, 62], [14, 18, 28], 0.22, 0.0],
    ["chambery", "Chambéry smoke", "Evening", [70, 70, 74], [24, 24, 26], 0.20, 0.04],
];
export const BACKDROPS = Object.freeze(Object.fromEntries(ROWS.map(([id, name, group, top, bottom, spot, mottle], i) => [id, { id, name, group, top, bottom, spot, mottle, seed: i + 11 }])));
/** The backdrop as interleaved float RGB 0..255. */
export function renderBackdrop(id, width, height) {
    const b = BACKDROPS[id];
    if (!b)
        throw new RangeError(`unknown backdrop ${id}`);
    if (width < 1 || height < 1)
        throw new RangeError("backdrop size must be positive");
    const n = width * height, out = new Float64Array(n * 3), big = Math.max(width, height);
    let texture = null, scale = 1, mean = 0;
    if (b.mottle) {
        texture = softBlur(hashNoise(width, height, b.seed), width, height, radiusFor(width, height, 1 / 24));
        for (let i = 0; i < n; i++)
            mean += texture[i];
        mean /= n;
        let top = 0;
        for (let i = 0; i < n; i++)
            top = Math.max(top, Math.abs(texture[i] - mean));
        scale = top || 1;
    }
    for (let y = 0; y < height; y++) {
        const t = y / Math.max(1, height - 1);
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            let gain = 1, mottle = 1;
            if (b.spot) {
                const dx = (x - SPOT_CENTRE[0] * (width - 1)) / big, dy = (y - SPOT_CENTRE[1] * (height - 1)) / big;
                const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.75);
                gain = 1 + b.spot * (1 - r * r * (3 - 2 * r));
            }
            if (texture)
                mottle = 1 + b.mottle * (texture[i] - mean) / scale;
            for (let k = 0; k < 3; k++) {
                const v = (b.top[k] * (1 - t) + b.bottom[k] * t) * gain * mottle;
                out[i * 3 + k] = Math.min(255, Math.max(0, v));
            }
        }
    }
    return out;
}
//# sourceMappingURL=backdrops.js.map