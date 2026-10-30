export const STYLE_KEYS = [
    "crescent_pixie", "swept_crop", "curtain_fringe", "temple_coils",
    "twist_taper", "underlayer_arc", "graduated_bob", "asymmetric_lob",
    "feathered_lob", "long_ribbons", "curly_shag", "sleek_side_part",
];
export const TEXTURES = ["straight", "wavy", "curly", "coily"];
export const SIMULATION_LABEL = "Illustrative hair placement simulation. No new hair or haircut is generated.";
export const DEFINITIONS = [
    { styleId: "crescent_pixie", title: "Crescent pixie", section: "short",
        note: "Curved temple shadow guide", orientation: -.15, shadow: 15, highlight: 9 },
    { styleId: "swept_crop", title: "Side-swept crop", section: "short",
        note: "Angled front and side guide", orientation: .45, shadow: 13, highlight: 11 },
    { styleId: "curtain_fringe", title: "Curtain fringe", section: "mid",
        note: "Two-part fringe highlight guide", orientation: .15, shadow: 11, highlight: 12 },
    { styleId: "temple_coils", title: "Tapered coils", section: "short",
        note: "Soft lower temple guide", orientation: .65, shadow: 17, highlight: 7 },
    { styleId: "twist_taper", title: "Twist taper", section: "short",
        note: "Twist top and temple guide", orientation: .25, shadow: 17, highlight: 8 },
    { styleId: "underlayer_arc", title: "Nape underlayer", section: "mid",
        note: "Lower arc shadow guide", orientation: 0, shadow: 18, highlight: 7 },
    { styleId: "graduated_bob", title: "Graduated bob", section: "mid",
        note: "Layered lower edge guide", orientation: -.25, shadow: 12, highlight: 11 },
    { styleId: "asymmetric_lob", title: "Asymmetric lob", section: "mid",
        note: "Diagonal length placement guide", orientation: .4, shadow: 14, highlight: 10 },
    { styleId: "feathered_lob", title: "Feathered lob", section: "mid",
        note: "Feathered side highlights guide", orientation: -.35, shadow: 10, highlight: 13 },
    { styleId: "long_ribbons", title: "Long ribbons", section: "long",
        note: "Long vertical movement guide", orientation: .1, shadow: 8, highlight: 15 },
    { styleId: "curly_shag", title: "Curly shag", section: "long",
        note: "Staggered curl highlight guide", orientation: .65, shadow: 12, highlight: 12 },
    { styleId: "sleek_side_part", title: "Sleek side part", section: "long",
        note: "Parting and surface sheen guide", orientation: -.1, shadow: 10, highlight: 14 },
];
const lookup = new Map(DEFINITIONS.map(def => [def.styleId, def]));
export function definition(style) {
    const result = lookup.get(style);
    if (result === undefined)
        throw new RangeError("unknown consultation hairstyle");
    return result;
}
export function validateGuideGeometry(geometry) {
    const points = [geometry.crown, geometry.left_temple, geometry.right_temple, geometry.chin];
    for (const point of points) {
        if (point.length !== 2)
            throw new RangeError("invalid head landmark");
        for (const value of point) {
            if (!Number.isFinite(value) || value < -.25 || value > 1.25) {
                throw new RangeError("head landmark out of normalized range");
            }
        }
    }
    if (geometry.left_temple[0] >= geometry.right_temple[0]) {
        throw new RangeError("temple order is reversed");
    }
    if (geometry.chin[1] - geometry.crown[1] < .1) {
        throw new RangeError("head height is too small");
    }
    if (geometry.right_temple[0] - geometry.left_temple[0] < .05) {
        throw new RangeError("head width is too small");
    }
}
const clamp = (value) => Math.min(1, Math.max(0, value));
const smooth = (value) => {
    const bound = clamp(value);
    return bound * bound * (3 - 2 * bound);
};
/** Computes pure local geometry; tiled and full evaluations share absolute coordinates. */
export function guideFields(style, geometry, width, height, rowStart = 0, rowStop = height) {
    const chosen = definition(style);
    validateGuideGeometry(geometry);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 ||
        height < 16 || width * height > 12_000_000) {
        throw new RangeError("unsupported picture size");
    }
    if (!Number.isInteger(rowStart) || !Number.isInteger(rowStop) ||
        rowStart < 0 || rowStop > height || rowStart >= rowStop) {
        throw new RangeError("invalid row interval");
    }
    const count = (rowStop - rowStart) * width;
    const zone = new Float32Array(new ArrayBuffer(count * 4));
    const grade = new Float32Array(new ArrayBuffer(count * 4));
    const tone = new Float32Array(new ArrayBuffer(count * 4));
    const centerX = (geometry.left_temple[0] + geometry.right_temple[0]) * .5 * width;
    const halfWidth = Math.max((geometry.right_temple[0] - geometry.left_temple[0]) * .5 * width, 1);
    const top = geometry.crown[1] * height;
    const length = Math.max((geometry.chin[1] - geometry.crown[1]) * height, 1);
    for (let row = rowStart; row < rowStop; row++) {
        for (let column = 0; column < width; column++) {
            const index = (row - rowStart) * width + column;
            const x = (column - centerX) / halfWidth;
            const y = (row - top) / length;
            const side = clamp((Math.abs(x) - .23) / .78);
            const lower = clamp((y - .35) / .82);
            const middle = clamp(1 - Math.abs(x) / 1.35);
            const front = clamp((.52 - y) / .58);
            const sweep = clamp((x + .68) / 1.5);
            const wave = Math.sin(5.3 * x + 7.1 * y);
            const curve = Math.cos(3.5 * x - 4.1 * y);
            let selected = false;
            let gradeValue = 1;
            let ribbon = 0;
            switch (style) {
                case "crescent_pixie":
                    selected = side > .06 && y > .01 && y < .9;
                    gradeValue = .79 - .62 * side - .16 * lower + .08 * curve;
                    ribbon = .64 * curve - .37;
                    break;
                case "swept_crop":
                    selected = front > .04 && y > -.2 && x > -1.05 && x < 1.1;
                    gradeValue = .52 + .33 * x - .46 * front + .12 * wave;
                    ribbon = .6 * wave + .15 * sweep;
                    break;
                case "curtain_fringe":
                    selected = front > .08 && Math.abs(x) > .11 && Math.abs(x) < 1.03;
                    gradeValue = .44 + .37 * Math.abs(x) - .3 * front;
                    ribbon = .8 * Math.cos(7 * Math.abs(x) + 2.1 * y);
                    break;
                case "temple_coils":
                    selected = side > .02 && y > .05 && y < .93;
                    gradeValue = .84 - .53 * side - .35 * lower + .1 * wave;
                    ribbon = .55 * wave - .46;
                    break;
                case "twist_taper":
                    selected = (side > .06 || middle > .7) && y > -.06 && y < .82;
                    gradeValue = .87 - .43 * side - .26 * front - .21 * lower;
                    ribbon = Math.cos(9 * x - 7 * y) * .53 - side * .23;
                    break;
                case "underlayer_arc": {
                    const arc = y - (.4 + .19 * x * x);
                    selected = arc > -.04 && arc < .62 && Math.abs(x) < 1.13;
                    gradeValue = .68 - .92 * arc + .07 * curve;
                    ribbon = -.5 + .3 * Math.sin(7 * x + y);
                    break;
                }
                case "graduated_bob":
                    selected = y > .3 && y < 1.11 && Math.abs(x) < 1.25;
                    gradeValue = .75 - .64 * lower - .09 * Math.abs(x) + .07 * wave;
                    ribbon = .58 * curve - .26 * lower;
                    break;
                case "asymmetric_lob": {
                    const diagonal = y - .43 + .28 * x;
                    selected = diagonal > -.02 && diagonal < .73 && Math.abs(x) < 1.19;
                    gradeValue = .8 - .84 * diagonal + .07 * Math.sin(3.1 * x);
                    ribbon = .61 * Math.sin(3.4 * x - 5.1 * y);
                    break;
                }
                case "feathered_lob":
                    selected = side > .08 && y > .25 && y < 1.3;
                    gradeValue = .76 - .52 * lower - .14 * side + .11 * wave;
                    ribbon = .6 * Math.sin(10 * x + 9 * y) + .24;
                    break;
                case "long_ribbons":
                    selected = y > .29 && y < 1.39 && Math.abs(x) > .14 && Math.abs(x) < 1.2;
                    gradeValue = .88 - .48 * lower - .32 * side;
                    ribbon = .7 * Math.cos(11 * x - 2 * y) + .17;
                    break;
                case "curly_shag":
                    selected = y > .09 && y < 1.24 && Math.abs(x) < 1.21;
                    gradeValue = .6 - .24 * lower + .2 * wave + .06 * side;
                    ribbon = .55 * Math.cos(9 * x + 11 * y);
                    break;
                case "sleek_side_part": {
                    const part = Math.abs(x + .3 + .09 * y);
                    selected = y > -.08 && y < 1.22 && Math.abs(x) < 1.13;
                    gradeValue = .38 + .28 * part + .17 * lower;
                    ribbon = .58 * Math.cos(8 * part) + .21;
                    break;
                }
            }
            let feather = 0;
            if (chosen.section === "short")
                feather = smooth(clamp((1.05 - Math.abs(x)) / .18));
            else if (chosen.section === "mid")
                feather = smooth(clamp((1.23 - Math.abs(x)) / .2));
            else
                feather = smooth(clamp((1.3 - Math.abs(x)) / .23));
            zone[index] = selected ? feather : 0;
            grade[index] = clamp(gradeValue);
            tone[index] = clamp((ribbon + 1) * .5) * 2 - 1;
        }
    }
    return { zone, grade, tone };
}
//# sourceMappingURL=style-guides.js.map