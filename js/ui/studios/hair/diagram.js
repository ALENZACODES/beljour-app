/** Original haircut consultation diagrams (NOT photographic or YouCam try-on).
 * Each illustration is a vector schematic of the cut's silhouette, length and
 * texture. No model weights, photo processing, copied styling assets or persons.
 * Hair diagrams are never presented as a preview of the person's appearance.
 * Author: John Khan.
 */
import { styleById } from "./model.js";
const HEAD = "M63 56 C52 56 44 66 44 86 C44 110 50 128 62 134 C75 128 82 111 82 87 C82 67 76 56 63 56 Z";
const NECK = "M54 127 Q55 147 44 151 L83 151 Q70 144 70 127";
const THEMES = {
    blue: { dark: "#1a2d64", medium: "#3e5b91", light: "#9bb3d3", edge: "#15305a" },
    neutral: { dark: "#282536", medium: "#63546b", light: "#b6a4b2", edge: "#302b42" },
    red: { dark: "#602839", medium: "#99566c", light: "#dab7c5", edge: "#652b41" },
};
function clamp(value, lower, upper) {
    return Math.max(lower, Math.min(upper, value));
}
function hash(text) {
    let current = 2166136261;
    for (const ch of text) {
        current ^= ch.charCodeAt(0);
        current = Math.imul(current, 16777619);
    }
    return current >>> 0;
}
function rnd(seed, nth) {
    let x = Math.imul((seed ^ Math.imul(nth + 17, 2654435761)), 2246822519);
    x ^= x >>> 16;
    x = Math.imul(x, 3266489917);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}
function esc(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function path(d, fill, stroke = "none", width = 0.8) {
    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
function line(x1, y1, x2, y2, stroke, width = 1, dash = "") {
    return `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
}
function circle(x, y, radius, fill, edge = "none") {
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${fill}" stroke="${edge}" stroke-width=".7"/>`;
}
/** Invariant: every diagram remains the same unnamed adult illustration. */
export function diagramMeasurements(style) {
    const seed = hash(style.id);
    const tags = new Set(style.tags);
    const name = style.name.toLowerCase();
    const short = style.lengths.includes("short");
    const long = style.lengths.includes("long");
    const crop = tags.has("crop") || name.includes("buzz") || name.includes("fade");
    const undercut = tags.has("undercut") || name.includes("undercut");
    const fade = name.includes("high fade") ? 0.88 : name.includes("low fade") ? 0.35
        : crop ? 0.62 : undercut ? 0.78 : style.group === "short-sides" ? 0.46 : 0;
    const volume = clamp(0.22 + rnd(seed, 2) * 0.58 + (name.includes("volume") ? 0.18 : 0), 0.18, 0.97);
    const hairLength = clamp(style.group === "short-sides" ? 0.19
        : style.group === "pixie" ? 0.24 : style.group === "bob" ? 0.53
            : style.group === "layers" ? 0.86 : style.group === "formal" ? 0.46
                : short && !long ? 0.33 : long ? 0.87 : 0.61, 0.1, 1);
    const curlCount = style.group === "curls" || tags.has("curls") || tags.has("coils")
        ? 14 + Math.round(rnd(seed, 3) * 12) : style.textures.includes("curly") ? 9 : 0;
    const fringe = style.group === "bangs" || tags.has("bangs") || name.includes("fringe") ? 0.5 + rnd(seed, 9) * 0.45 : 0;
    const braidCount = tags.has("braids") ? 7 : tags.has("twists") ? 5 : 0;
    const taper = style.group === "short-sides" || name.includes("taper") ? 0.55 + rnd(seed, 6) * 0.36 : 0;
    return { hairLength, sideHeight: 0.2 + rnd(seed, 5) * 0.8, partX: 57 + rnd(seed, 4) * 13,
        volume, curlCount, fade, fringe, taper, braidCount,
        updo: style.group === "formal" && !name.includes("blowout") ? 0.5 + rnd(seed, 8) * 0.48 : 0 };
}
function hairShape(measure, style, palette) {
    const extent = 12 + measure.hairLength * 57;
    const top = 58 - 13 * measure.volume;
    const side = measure.hairLength < 0.3 ? 30 : 24;
    const base = 52 + extent;
    const faceX = 62;
    const pieces = [];
    const primary = palette.dark;
    if (measure.updo > 0) {
        const topKnot = measure.updo > 0.75;
        pieces.push(circle(topKnot ? 62 : 83, topKnot ? 34 : 99, 7 + 7 * measure.updo, palette.medium, palette.edge));
        pieces.push(circle(topKnot ? 63 : 84, topKnot ? 34 : 99, 4 + 6 * measure.updo, palette.dark));
    }
    if (measure.hairLength < 0.31) {
        pieces.push(path(`M${faceX - side} 81 Q${faceX - 25} ${top + 1} ${faceX} ${top}
      Q${faceX + 26} ${top + 2} ${faceX + side} 81
      L80 94 Q77 68 62 ${top + 7} Q48 67 45 94 Z`, primary));
        if (measure.fade > 0) {
            pieces.push(path(`M40 78 Q44 61 50 59 L49 95 Q45 98 42 97 Z`, palette.light));
            pieces.push(path(`M85 78 Q82 61 76 59 L76 95 Q80 98 83 97 Z`, palette.light));
            const y = (88 - measure.fade * 21).toFixed(2);
            pieces.push(line(43, Number(y), 50, Number(y) - 2, palette.medium, 1.6));
            pieces.push(line(76, Number(y) - 2, 83, Number(y), palette.medium, 1.6));
        }
    }
    else {
        pieces.push(path(`M${faceX - side} 80 C${38 - 5 * measure.volume} 55 ${42 + 4 * measure.volume} ${top}
      62 ${top - 2} C84 ${top - 2} ${91 + 6 * measure.volume} 56 ${faceX + side} 82
      L${faceX + side + 5} ${base} Q${faceX + 17} ${base + 4} 76 ${base - 4}
      L77 88 Q73 62 62 64 Q51 62 48 88
      L48 ${base - 4} Q${faceX - 17} ${base + 4} ${faceX - side - 5} ${base} Z`, primary));
        const bottomWave = style.textures.includes("wavy") || measure.curlCount > 0;
        if (bottomWave) {
            for (let n = 0; n < 6; n++) {
                const x = n < 3 ? 34 + n * 7 : 80 + (n - 3) * 6;
                const y = base - (n % 2) * 6;
                pieces.push(path(`M${x} ${y - 22} C${x + 8} ${y - 16} ${x - 8} ${y - 7} ${x} ${y}`, "none", palette.light, 1.6));
            }
        }
    }
    if (measure.fringe > 0) {
        const end = 70 + 14 * measure.fringe;
        pieces.push(path(`M45 66 Q52 51 62 57 Q72 51 80 66 Q72 ${end - 6} 62 ${end}
      Q53 ${end - 2} 45 66 Z`, palette.medium));
        for (let k = 0; k < 5; k++) {
            const x = 49 + k * 6;
            pieces.push(line(x, 62, x + (k - 2) * 1.2, end - (k % 3) * 3, palette.dark, 0.75));
        }
    }
    return pieces;
}
function hairTexture(style, metrics, palette) {
    const out = [];
    const seed = hash(style.id);
    const start = 50 - 13 * metrics.volume;
    if (metrics.curlCount) {
        for (let n = 0; n < metrics.curlCount; n++) {
            const x = 37 + rnd(seed, n * 3) * 50;
            const y = start + rnd(seed, n * 3 + 1) * (15 + metrics.hairLength * 66);
            const radius = 1.4 + 2.2 * rnd(seed, n * 3 + 2);
            if (y > 140 || (x > 49 && x < 76 && y > 71))
                continue;
            out.push(circle(x, y, radius, "none", palette.light));
        }
    }
    else {
        for (let k = 0; k < 8; k++) {
            const x = 40 + k * 6.4;
            const sway = (rnd(seed, k) - 0.5) * 4;
            const y = start + 4 + rnd(seed, k + 9) * 3;
            const end = metrics.hairLength < 0.3 ? 73 : 77 + metrics.hairLength * 58;
            if (x < 50 || x > 75)
                out.push(path(`M${x.toFixed(2)} ${y.toFixed(2)} Q${(x + sway + 4).toFixed(2)} 90 ${x.toFixed(2)} ${end.toFixed(2)}`, "none", palette.medium, 0.9));
            else
                out.push(path(`M${x.toFixed(2)} ${y.toFixed(2)} Q${(x + sway).toFixed(2)} 62 ${x.toFixed(2)} 65`, "none", palette.medium, 1));
        }
    }
    for (let k = 0; k < metrics.braidCount; k++) {
        const x = 38 + k * 7;
        const from = 54 + ((k + 1) % 2) * 3;
        const end = 87 + metrics.hairLength * 52;
        out.push(path(`M${x} ${from} C${x + 9} ${from + 18} ${x - 8} ${end - 18} ${x + 2} ${end}`, "none", palette.light, 2.7));
        for (let n = 0; n < 5; n++) {
            const y = from + 8 + n * ((end - from - 8) / 5);
            out.push(line(x - 2, y - 3, x + 3, y + 2, palette.dark, 1.1));
        }
    }
    return out;
}
function panelGuides(palette) {
    return [
        line(21, 53, 21, 137, palette.light, 0.65, "2 4"),
        line(99, 53, 99, 137, palette.light, 0.65, "2 4"),
        line(25, 142, 95, 142, palette.light, 0.65, "2 4"),
        circle(21, 53, 1.4, palette.light), circle(99, 53, 1.4, palette.light),
    ];
}
function validOptions(options) {
    const size = options.size ?? 168;
    if (!Number.isFinite(size) || size < 64 || size > 1600)
        throw new RangeError("Illustration size must be 64-1600 px");
    const tone = options.tone ?? "blue";
    if (!(tone in THEMES))
        throw new RangeError("Unknown diagram palette");
    const bg = options.background ?? "paper";
    if (bg !== "paper" && bg !== "transparent")
        throw new RangeError("Unknown diagram background");
    return { size: Math.trunc(size), guides: options.guides ?? true,
        tone, background: bg, showCaption: options.showCaption ?? true };
}
/** Render a standalone SVG string from validated built-in catalogue metadata.
 * The string is safe to use as an <img> data URI (untrusted text is XML-escaped).
 */
export function hairDiagramSvg(style, options = {}) {
    if (!styleById(style.id))
        throw new RangeError("Unknown salon reference");
    const o = validOptions(options);
    const palette = THEMES[o.tone];
    const metrics = diagramMeasurements(style);
    const base = [
        o.background === "paper" ? `<rect width="124" height="174" fill="#f9f9fc" rx="8"/>` : "",
        o.guides ? panelGuides(palette).join("") : "",
        path(NECK, "#dfb8a4", palette.edge, 0.6),
        path(HEAD, "#efcfbd", palette.edge, 0.9),
        path("M47 89 Q51 86 55 89 M69 89 Q73 86 77 89", "none", "#6d5a60", 0.9),
        path("M62 94 L61 108 L65 110", "none", "#9c7470", 0.7),
        path("M56 118 Q62 121 68 118", "none", "#9a6570", 0.8),
        ...hairShape(metrics, style, palette),
        ...hairTexture(style, metrics, palette),
        o.showCaption ? `<text x="62" y="164" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6.5" fill="${palette.edge}">${esc(style.name.slice(0, 31))}</text>` : "",
        `<title>${esc(style.name)}. Cut diagram; not a hair preview.</title>`,
    ];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 174" width="${o.size}" height="${Math.round(o.size * 174 / 124)}" role="img" aria-label="${esc(style.name)} cut diagram, not a photo"><g>${base.join("")}</g></svg>`;
}
export function hairDiagramDataUri(style, options = {}) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(hairDiagramSvg(style, options));
}
export function diagramDistance(a, b) {
    const left = diagramMeasurements(a), right = diagramMeasurements(b);
    const keys = ["hairLength", "sideHeight", "partX", "volume",
        "curlCount", "fade", "fringe", "taper", "braidCount", "updo"];
    return keys.reduce((sum, key) => sum + Math.abs(left[key] - right[key]), 0);
}
