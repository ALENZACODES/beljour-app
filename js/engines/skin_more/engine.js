/** Browser mirror for R16B Skin & More. Author: John Khan. */
import { LABEL, VERSION, parseSkinMoreOptions } from "./contracts.js";
import { faceEllipse, namedMasks, unionMasks } from "./raster.js";
function recolour(photo, data, mask, c, amount) {
    for (let i = 0; i < mask.length; i++) {
        const a = mask[i] * amount, o = i * photo.channels;
        if (a <= 0)
            continue;
        const lum = (data[o] + data[o + 1] + data[o + 2]) / 3 / 255;
        for (let k = 0; k < 3; k++) {
            const target = c[k] * (.64 + .36 * lum);
            data[o + k] = Math.round(data[o + k] * (1 - a) + target * a);
        }
    }
}
function accessory(w, h, kind, amount) {
    const m = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let hit = false;
            if (kind === "glasses") {
                for (const cx of [w * .37, w * .63]) {
                    const dx = (x - cx) / (w * (.12 + .025 * amount) + 1), dy = (y - h * .39) / (h * (.055 + .012 * amount) + 1);
                    const q = dx * dx + dy * dy;
                    if (Math.abs(q - 1) < .08)
                        hit = true;
                }
            }
            else {
                for (const [cx, cy] of [[w * .19, h * .49], [w * .81, h * .49]])
                    if (Math.hypot(x - cx, y - cy) < Math.min(w, h) * (.012 + .018 * amount))
                        hit = true;
            }
            m[y * w + x] = hit ? 1 : 0;
        }
    return m;
}
export function renderSkinMore(photo, raw) {
    const req = parseSkinMoreOptions(raw);
    const named = namedMasks(photo.width, photo.height, req.masks), manual = unionMasks(photo.width, photo.height, named.values()), face = faceEllipse(photo.width, photo.height), data = new Uint8ClampedArray(photo.data);
    let coverage = new Float32Array(photo.width * photo.height);
    const notes = [];
    const extra = {};
    const a = req.amount;
    switch (req.feature) {
        case "W77":
            coverage = face;
            recolour(photo, data, coverage, req.colour, .18 * a);
            notes.push("Sheer match preview; undertone is not hidden by opacity.");
            break;
        case "W78":
            coverage = face;
            recolour(photo, data, coverage, req.style === "olive" ? [139, 111, 69] : [155, 103, 70], .13 * a);
            notes.push("Cosmetic colour preview only.");
            break;
        case "W79":
            coverage = manual;
            recolour(photo, data, coverage, req.colour, .18 * a);
            break;
        case "W80":
            coverage = manual;
            recolour(photo, data, coverage, [235, 238, 235], (req.style === "clear_finish" ? .025 : req.style === "tinted_cast" ? .1 : .28) * a);
            notes.push("No SPF efficacy claim.");
            break;
        case "W81":
        case "W82":
            coverage = manual;
            recolour(photo, data, coverage, req.colour, .13 * a);
            notes.push("User-marked cosmetic area; no diagnosis.");
            break;
        case "W83":
            extra.diary = { samples: req.diary_values.length, mean: req.diary_values.length ? req.diary_values.reduce((x, y) => x + y, 0) / req.diary_values.length : 0, label: "No health prediction." };
            notes.push("Local diary only.");
            break;
        case "W84":
        case "W89":
        case "W92":
            coverage = face;
            recolour(photo, data, coverage, req.colour, .07 * a);
            break;
        case "W85":
            coverage = unionMasks(photo.width, photo.height, [manual, accessory(photo.width, photo.height, "jewellery", a)]);
            recolour(photo, data, coverage, req.colour, .8 * a);
            break;
        case "W86":
            coverage = unionMasks(photo.width, photo.height, [manual, accessory(photo.width, photo.height, "glasses", a)]);
            recolour(photo, data, coverage, req.secondary_colour, .9 * a);
            break;
        case "W87":
        case "W88":
        case "W91":
            coverage = manual;
            recolour(photo, data, coverage, req.colour, .4 * a);
            break;
        case "W90":
            coverage = manual;
            if (req.style !== "preserve")
                recolour(photo, data, coverage, [96, 62, 45], .2 * a);
            break;
        default: throw new RangeError("unsupported feature");
    }
    if (a === 0)
        for (let i = 0; i < data.length; i++)
            data[i] = photo.data[i];
    let changed = 0;
    for (let i = 0; i < coverage.length; i++) {
        const o = i * photo.channels;
        if (data[o] !== photo.data[o] || data[o + 1] !== photo.data[o + 1] || data[o + 2] !== photo.data[o + 2])
            changed++;
    }
    return { data, coverage, report: { feature: req.feature, style: req.style, label: LABEL, version: VERSION, notes, manual_regions: [...named.keys()], local_only: req.feature === "W83", changed_fraction: changed / coverage.length, texture_preserved: true, ...extra } };
}
//# sourceMappingURL=engine.js.map