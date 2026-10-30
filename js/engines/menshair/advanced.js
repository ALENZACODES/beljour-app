export const EXTENDED_FAMILIES = [
    "quiff", "pompadour", "mohawk", "mullet", "curtain", "slick", "afro", "coils",
    "bob", "lob", "pixie", "shag", "layers", "fringe", "waves", "curls", "braid",
    "ponytail", "bun", "updo", "locs", "shoulder",
    "ivy", "twists", "curly-fade", "high-top", "caesar", "fauxhawk", "flattop",
];
export const PATTERNS = ["plain", "soft", "wave", "curl", "grain", "braid", "strand"];
export const PRESENTATIONS = ["masculine", "feminine", "unisex"];
function smooth(lo, hi, value) {
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}
function patternAt(x, y, flow, pattern) {
    if (pattern === "plain")
        return 1;
    if (pattern === "soft" || pattern === "wave") {
        const ridge = (x * 11 + y * 3 + (flow + 100) * 7) % 47;
        const triangle = 1 - Math.abs(ridge - 23) / 23;
        return pattern === "soft" ? .85 + .15 * triangle : .68 + .32 * triangle;
    }
    if (pattern === "curl") {
        const curly = (x * 13 + y * 17 + ((x * y) % 19) * 3 + flow + 100) % 101;
        return .53 + .47 * curly / 100;
    }
    if (pattern === "grain") {
        const grain = (x * 19 + y * 23 + ((x * y) % 29) * 5) % 127;
        return .70 + .30 * grain / 126;
    }
    if (pattern === "braid") {
        const braid = (x * 5 + y * 13 + (flow + 100) * 3) % 37;
        return .60 + .40 * (1 - Math.abs(braid - 18) / 18);
    }
    const strand = (x * 7 + y * 2 + flow + 100) % 23;
    return .54 + .46 * (1 - Math.abs(strand - 11) / 11);
}
export function spatialAt(u, v, x, y, family, parameters) {
    const side = smooth(.26, .94, Math.abs(u));
    const middle = 1 - smooth(.12, .95, Math.abs(u));
    const top = 1 - smooth(.05, .63, v);
    const crown = 1 - smooth(.01, .37, Math.sqrt(u * u * .50 + (v - .13) ** 2));
    const lower = smooth(.43, 1.05, v);
    const nape = smooth(.64, 1.19, v);
    const edge = smooth(.48, .98, Math.abs(u));
    const flow = parameters.flow ?? 0;
    const sweep = Math.max(0, Math.min(1, .50 + flow / 100 * u * .45));
    const length = (parameters.length ?? 0) / 100;
    const topFraction = (parameters.top_bias ?? 0) / 100;
    const sideFraction = (parameters.side_bias ?? 0) / 100;
    const fringe = (parameters.fringe ?? 0) / 100;
    let response = 0;
    switch (family) {
        case "quiff":
            response = top * (.14 + .48 * middle + .16 * sweep) + .30 * side * lower;
            break;
        case "pompadour":
            response = .64 * crown + .28 * middle * top + .34 * side * lower;
            break;
        case "mohawk":
            response = .77 * side * smooth(.15, .49, v) + .18 * middle * top;
            break;
        case "mullet":
            response = .42 * side * lower + .48 * middle * nape + .13 * top;
            break;
        case "curtain":
            response = .35 * top + .34 * (1 - middle) * top + .22 * lower * side;
            break;
        case "slick":
            response = .26 * top + .40 * side * lower + .18 * sweep;
            break;
        case "afro":
            response = .46 * crown + .34 * side * (1 - smooth(.49, 1, v));
            break;
        case "coils":
            response = .32 * crown + .26 * side * top + .16 * middle * lower;
            break;
        case "bob":
            response = .21 * top + .58 * side * lower * (1 - smooth(.85, 1.28, v));
            break;
        case "lob":
            response = .18 * top + .55 * side * lower + .18 * edge * nape;
            break;
        case "pixie":
            response = .55 * side * smooth(.15, .58, v) + .25 * crown;
            break;
        case "shag":
            response = .23 * crown + .26 * side * lower + .26 * middle * nape;
            break;
        case "layers":
            response = .16 * top + .33 * side * lower + .33 * nape * middle;
            break;
        case "fringe":
            response = .61 * middle * top + .25 * side * lower;
            break;
        case "waves":
            response = .17 * top + .40 * side * lower + .21 * middle * crown;
            break;
        case "curls":
            response = .26 * crown + .40 * side * lower + .16 * middle * top;
            break;
        case "braid":
            response = .24 * side * lower + .54 * middle * nape + .12 * crown;
            break;
        case "ponytail":
            response = .35 * crown + .56 * middle * nape + .16 * lower * edge;
            break;
        case "bun":
            response = .67 * crown + .23 * side * top;
            break;
        case "updo":
            response = .48 * crown + .20 * middle * top + .18 * side * lower;
            break;
        case "locs":
            response = .20 * top + .33 * side * lower + .25 * middle * nape;
            break;
        case "shoulder":
            response = .15 * top + .43 * side * lower + .28 * edge * nape;
            break;
        case "ivy":
            response = .18 * top + .42 * side * lower + .27 * crown * sweep;
            break;
        case "twists":
            response = .41 * crown + .24 * middle * top + .27 * side * lower;
            break;
        case "curly-fade":
            response = .53 * crown + .21 * top * middle + .34 * side * lower;
            break;
        case "high-top": {
            const plateau = 1 - smooth(.38, .68, Math.abs(u));
            response = .48 * top * plateau + .52 * side * lower;
            break;
        }
        case "caesar":
            response = .37 * middle * top + .19 * top + .39 * side * lower;
            break;
        case "fauxhawk": {
            const ridge = 1 - smooth(.16, .61, Math.abs(u));
            response = .51 * ridge * top + .35 * side * lower;
            break;
        }
        case "flattop": {
            const rim = 1 - smooth(.24, .86, Math.abs(u));
            response = .56 * top * rim + .29 * side * lower;
            break;
        }
        default:
            response = .19 * side * lower + .12 * top * middle;
            break;
    }
    response += .26 * topFraction * crown;
    response += .24 * sideFraction * side * lower;
    response += .23 * fringe * middle * top;
    response += .18 * length * nape * (.6 * side + .4 * middle);
    response *= .78 + .22 * (parameters.definition ?? 50) / 100;
    response *= patternAt(x, y, flow, parameters.pattern ?? "plain");
    return Math.max(0, Math.min(1, response));
}
export function familyRatio(family) {
    if (["pixie", "mohawk", "quiff", "pompadour"].includes(family))
        return .67;
    if (["braid", "locs", "ponytail", "bun", "updo"].includes(family))
        return .52;
    if (["curls", "waves", "afro", "coils", "twists", "curly-fade"].includes(family))
        return .57;
    if (["bob", "lob", "shoulder", "layers"].includes(family))
        return .55;
    return .62;
}
//# sourceMappingURL=advanced.js.map