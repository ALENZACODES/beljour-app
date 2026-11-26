/** Palette extraction and recommendations. Author: John Khan. */
import { compatibility } from "./colour.js";
export function extractPalette(photo, mask, count = 6) { const rows = []; for (let i = 0; i < photo.width * photo.height; i++) {
    if (mask && mask[i] <= .1)
        continue;
    const o = i * photo.channels, rgb = [photo.data[o], photo.data[o + 1], photo.data[o + 2]];
    rows.push({ rgb, l: .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] });
} if (!rows.length)
    throw new RangeError("palette region empty"); rows.sort((a, b) => a.l - b.l); const out = []; for (let i = 0; i < count; i++) {
    const q = .08 + (.84 * i / Math.max(count - 1, 1)), rgb = rows[Math.min(rows.length - 1, Math.floor(q * (rows.length - 1)))].rgb;
    if (!out.some(c => c.every((v, k) => v === rgb[k])))
        out.push(rgb);
} return out; }
export function recommend(colours, undertone) { return colours.map(rgb => ({ rgb, role: "recommended", undertone_score: compatibility(rgb, undertone), source: "local-colour-math" })).sort((a, b) => b.undertone_score - a.undertone_score); }
//# sourceMappingURL=palette.js.map