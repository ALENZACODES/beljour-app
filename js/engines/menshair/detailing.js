export const EDGES = ["natural", "square", "rounded", "peaked", "asymmetric"];
export const NECKLINES = ["natural", "tapered", "blocked", "rounded", "v-shaped", "drop"];
export const TEMPLES = ["natural", "close", "wide", "arched", "soft"];
export const PARTINGS = ["none", "fine-left", "fine-right", "broad-left", "broad-right"];
export function validateDetail(p) {
    if (p.edge !== undefined && !EDGES.includes(p.edge))
        throw Error("Invalid haircut edge.");
    if (p.neckline !== undefined && !NECKLINES.includes(p.neckline))
        throw Error("Invalid neckline.");
    if (p.temple !== undefined && !TEMPLES.includes(p.temple))
        throw Error("Invalid temple.");
    if (p.parting !== undefined && !PARTINGS.includes(p.parting))
        throw Error("Invalid part line.");
    for (const key of ["crown_volume", "fringe_drop", "texture_tightness", "edge_softness",
        "temple_width", "nape_height", "part_contrast", "part_offset"]) {
        const value = p[key];
        if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 100)) {
            throw Error(`Invalid detail parameter ${key}.`);
        }
    }
    if (p.direction !== undefined && (!Number.isInteger(p.direction) || p.direction < -100 || p.direction > 100)) {
        throw Error("Invalid styling direction.");
    }
}
export function activeDetail(p) {
    return (p.edge ?? "natural") !== "natural" || (p.neckline ?? "natural") !== "natural" ||
        (p.temple ?? "natural") !== "natural" || (p.parting ?? "none") !== "none" ||
        (p.crown_volume ?? 0) > 0 || (p.fringe_drop ?? 0) > 0 || (p.texture_tightness ?? 0) > 0;
}
function smooth(lo, hi, v) {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}
function ridge(target, value, width) {
    return 1 - smooth(width * .30, width, Math.abs(value - target));
}
function hairline(u, v, p) {
    const edge = p.edge ?? "natural";
    if (edge === "natural")
        return 0;
    let boundary = .10 + (100 - (p.fringe_drop ?? 0)) / 100 * .035;
    if (edge === "square")
        boundary += .045 * smooth(.70, 1.05, Math.abs(u));
    else if (edge === "rounded")
        boundary += .075 * u * u;
    else if (edge === "peaked")
        boundary += .055 * (1 - smooth(.05, .55, Math.abs(u)));
    else if (edge === "asymmetric")
        boundary += .045 * u;
    const width = .033 + (p.edge_softness ?? 50) / 100 * .053;
    return ridge(boundary, v, width) * (1 - smooth(.68, 1.09, Math.abs(u))) *
        (.16 + (p.fringe_drop ?? 0) / 100 * .17);
}
function neckline(u, v, p) {
    const line = p.neckline ?? "natural";
    if (line === "natural")
        return 0;
    let boundary = 1.23 + ((p.nape_height ?? 50) - 50) / 100 * .23;
    if (line === "tapered")
        boundary -= .09 * Math.abs(u);
    else if (line === "rounded")
        boundary -= .12 * u * u;
    else if (line === "v-shaped")
        boundary += .11 * (1 - Math.abs(u));
    else if (line === "drop")
        boundary += .07 * smooth(.33, .93, Math.abs(u));
    const width = .045 + (p.edge_softness ?? 50) / 100 * .045;
    return .32 * ridge(boundary, v, width) * (1 - smooth(.75, 1.13, Math.abs(u)));
}
function temple(u, v, p) {
    const shape = p.temple ?? "natural";
    if (shape === "natural")
        return 0;
    const width = .23 + (p.temple_width ?? 50) / 100 * .20;
    const distance = Math.abs(Math.abs(u) - (shape === "wide" ? .78 : .89));
    const gate = 1 - smooth(width * .25, width, distance);
    let longitudinal;
    if (shape === "close")
        longitudinal = 1 - smooth(.37, .86, Math.abs(v - .50));
    else if (shape === "arched")
        longitudinal = ridge(.48 + .13 * u * u, v, .36);
    else if (shape === "soft")
        longitudinal = 1 - smooth(.35, 1.20, Math.abs(v - .64));
    else
        longitudinal = 1 - smooth(.43, 1.10, Math.abs(v - .63));
    return .30 * gate * longitudinal;
}
function parting(u, v, p) {
    const shape = p.parting ?? "none";
    if (shape === "none")
        return 0;
    const side = shape.endsWith("left") ? -1 : 1;
    const spread = .15 + (p.part_offset ?? 50) / 100 * .25;
    const drift = .10 * (p.direction ?? 0) / 100 * smooth(.03, .58, v);
    const line = side * spread + drift;
    const broad = shape.startsWith("broad");
    const width = (broad ? .060 : .023) + (p.edge_softness ?? 50) / 100 * .025;
    return (.20 + (p.part_contrast ?? 50) / 100 * .40) * ridge(line, u, width) * (1 - smooth(.28, .83, v));
}
function crown(u, v, p) {
    const volume = p.crown_volume ?? 0;
    if (!volume)
        return 0;
    const x = u * (1 + (p.direction ?? 0) / 100 * .13);
    const ellipse = Math.sqrt((x / .75) ** 2 + ((v - .24) / .46) ** 2);
    return volume / 100 * .32 * (1 - smooth(.22, 1, ellipse));
}
function fringe(u, v, p) {
    const drop = p.fringe_drop ?? 0;
    if (!drop)
        return 0;
    const line = .13 + drop / 100 * .27 + (p.direction ?? 0) / 100 * u * .06;
    return .26 * drop / 100 * ridge(line, v, .14) * (1 - smooth(.48, 1.04, Math.abs(u)));
}
function texture(u, v, x, y, p) {
    const tightness = p.texture_tightness ?? 0;
    if (!tightness)
        return 0;
    const phase = (p.direction ?? 0) + 100;
    const a = (x * (7 + Math.floor(tightness / 20)) + y * 11 + phase * 3) % 61;
    const b = (x * 13 + y * (3 + Math.floor(tightness / 25)) + phase * 7) % 47;
    const variation = a / 60 * .55 + b / 46 * .45;
    const volume = (1 - smooth(.33, .96, Math.abs(u))) * (1 - smooth(.54, 1.08, v));
    return .25 * tightness / 100 * variation * volume;
}
export function detailAt(u, v, x, y, p) {
    return Math.max(0, Math.min(1, Math.max(hairline(u, v, p), neckline(u, v, p), temple(u, v, p), parting(u, v, p), crown(u, v, p), fringe(u, v, p), texture(u, v, x, y, p))));
}
export function detailField(width, height, anchors, p) {
    validateDetail(p);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
        width * height > 24_000_000)
        throw Error("Invalid detail geometry.");
    const result = new Float64Array(width * height);
    if (!activeDetail(p))
        return result;
    const centre = (anchors.left_temple[0] + anchors.right_temple[0]) / 2;
    const half = Math.max((anchors.right_temple[0] - anchors.left_temple[0]) / 2, .01);
    const ear = (anchors.left_ear[1] + anchors.right_ear[1]) / 2;
    const span = Math.max(ear - anchors.crown[1], .01);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const u = ((x + .5) / width - centre) / half;
            const v = ((y + .5) / height - anchors.crown[1]) / span;
            result[y * width + x] = detailAt(u, v, x, y, p);
        }
    }
    return result;
}
//# sourceMappingURL=detailing.js.map