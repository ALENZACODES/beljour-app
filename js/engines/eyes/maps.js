import { PALETTE } from "../../ui/palette.js";
export const MAP_LABEL = "Lash map simulation — discuss with a qualified lash professional.";
export const MAP_WARNING = "Relative lengths are visual estimates. No millimetre fit, product match or achievable result is promised.";
function finite(value, name, low, high) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high)
        throw new RangeError(`invalid map ${name}`);
    return value;
}
export function validateMap(value) {
    if (!["right", "left"].includes(value.side))
        throw new RangeError("map must name a side");
    if (!Array.isArray(value.zones) || value.zones.length !== 7)
        throw new RangeError("map must have seven zones");
    const zones = value.zones.map((zone, index) => {
        if (zone.zone !== index + 1)
            throw new RangeError("map zone order is invalid");
        const start = finite(zone.start, "start", 0, 1), end = finite(zone.end, "end", 0, 1);
        if (Math.abs(start - index / 7) > 1e-8 || Math.abs(end - (index + 1) / 7) > 1e-8)
            throw new RangeError("map zones must cover the measured eye once");
        const fans = finite(zone.fan_count, "fan count", 1, 5);
        if (!Number.isInteger(fans))
            throw new RangeError("map fan count must be an integer");
        return { zone: index + 1, start, end, length_eye_width: finite(zone.length_eye_width, "length", .005, .6),
            curl: finite(zone.curl, "curl", 0, 1), fan_count: fans };
    });
    const style = value.style ?? "", family = value.family ?? "";
    if (typeof style !== "string" || typeof family !== "string" || style.length > 40 || family.length > 40)
        throw new RangeError("map labels must be short text");
    const warnings = value.warnings ?? [];
    if (!Array.isArray(warnings) || warnings.length > 16 || warnings.some(w => typeof w !== "string" || w.length > 500))
        throw new RangeError("map warnings must be a bounded text list");
    return { side: value.side, style, family, zones, warnings: [...warnings], physical_mm: null };
}
export function mapDocument(maps) {
    if (maps.length < 1 || maps.length > 2)
        throw new RangeError("a lash document needs one or two eye maps");
    const eyes = maps.map(validateMap);
    if (new Set(eyes.map(e => e.side)).size !== eyes.length)
        throw new RangeError("duplicate eye map");
    return { format: "beljour-lash-map/1", author: "John Khan", label: MAP_LABEL, warning: MAP_WARNING,
        unit: "share_of_measured_eye_width", eyes, photo_included: false, face_coordinates_included: false, simulation: true };
}
function escape(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
const n = (value) => value.toFixed(3);
export function lashMapSvg(maps) {
    const document = mapDocument(maps), height = 120 + 210 * document.eyes.length;
    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${height}" viewBox="0 0 760 ${height}" role="img" aria-labelledby="lash-title lash-desc">`,
        `<title id="lash-title">${escape(MAP_LABEL)}</title>`,
        `<desc id="lash-desc">${escape(MAP_WARNING)}</desc>`,
        `<rect width="760" height="100%" fill="${PALETTE.cream}"/>`, // a saved map: fixed light palette; lashes keep their ink
        `<g font-family="sans-serif" fill="${PALETTE.plum}">`,
        '<text x="28" y="32" font-size="20">Lash map simulation</text>',
        '<text x="28" y="56" font-size="13">Relative length / measured eye width. Not a millimetre prescription.</text>',
    ];
    document.eyes.forEach((eye, index) => {
        const y = 86 + index * 210;
        const label = `${eye.side[0].toUpperCase()}${eye.side.slice(1)} eye · ${eye.family} · ${eye.style}`;
        parts.push(`<text x="28" y="${y}" font-size="16">${escape(label)}</text>`);
        parts.push(`<path d="M 70 ${y + 96} Q 380 ${y + 30} 690 ${y + 96}" fill="none" stroke="${PALETTE.plum}" stroke-width="2"/>`);
        for (const zone of eye.zones) {
            const middle = (zone.start + zone.end) / 2, x = 70 + 620 * middle;
            const rootY = y + 96 - 132 * middle * (1 - middle), length = zone.length_eye_width * 230;
            for (let fan = 0; fan < zone.fan_count; fan++) {
                const lean = (fan - (zone.fan_count - 1) / 2) * 5;
                const path = `M ${n(x)} ${n(rootY)} Q ${n(x + lean * .4)} ${n(rootY - length * .45)} ${n(x + lean)} ${n(rootY - length)}`;
                parts.push(`<path d="${path}" fill="none" stroke="#202030" stroke-width="1.4"/>`);
            }
            parts.push(`<text x="${n(x)}" y="${y + 124}" text-anchor="middle" font-size="13">${zone.zone}</text>`);
            parts.push(`<text x="${n(x)}" y="${y + 145}" text-anchor="middle" font-size="13">${(zone.length_eye_width * 100).toFixed(1)}%</text>`);
            parts.push(`<text x="${n(x)}" y="${y + 165}" text-anchor="middle" font-size="12">curl ${zone.curl.toFixed(2)}</text>`);
        }
        if (eye.warnings.length)
            parts.push(`<text x="28" y="${y + 192}" font-size="12" fill="${PALETTE.wine}">Suitability warnings are included in the companion data.</text>`);
    });
    parts.push(`<text x="28" y="${height - 18}" font-size="12">Original diagram · John Khan · No photo or face coordinates included</text>`, "</g>", "</svg>");
    return parts.join("\n");
}
export function lashMapCsv(maps) {
    const document = mapDocument(maps);
    const rows = ["simulation,side,zone,start_eye_fraction,end_eye_fraction,length_eye_fraction,curl,fan_count"];
    for (const eye of document.eyes) {
        for (const zone of eye.zones) {
            rows.push(["yes", eye.side, zone.zone, zone.start.toFixed(6), zone.end.toFixed(6), zone.length_eye_width.toFixed(6), zone.curl.toFixed(6), zone.fan_count].join(","));
        }
    }
    return rows.join("\n") + "\n";
}
