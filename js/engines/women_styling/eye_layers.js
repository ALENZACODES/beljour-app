/** Original W59–W76 lash, lid, iris and brow previews.
 * All output is local and requires explicitly supplied region masks.
 * W74 is intentionally omitted; a cosmetic serum growth forecast would
 * misrepresent biological outcomes. Author: John Khan.
 */
import { mixRGB } from './palette.js';
function layer(region, kind, color, opacity, placement = 'uniform') {
    if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100) {
        throw new Error('Invalid eye layer intensity');
    }
    return { region, kind, color, opacity, placement, scale: 100 };
}
function pair(a, b, kind, color, opacity, placement = 'uniform') {
    return [layer(a, kind, color, opacity, placement), layer(b, kind, color, opacity, placement)];
}
function lashes(kind, color, opacity, position = 'uniform') {
    return pair('lash_left', 'lash_right', kind, color, opacity, position);
}
function lids(kind, color, opacity, position = 'uniform') {
    return pair('lid_left', 'lid_right', kind, color, opacity, position);
}
function liner(kind, color, opacity, position = 'uniform') {
    return pair('liner_left', 'liner_right', kind, color, opacity, position);
}
function brows(kind, color, opacity, position = 'uniform') {
    return pair('brow_left', 'brow_right', kind, color, opacity, position);
}
function lashExtension(req) {
    if (req.variant === 'natural')
        return lashes('shadow', [13, 12, 12], 54);
    if (req.variant === 'fan')
        return lashes('strands', [33, 30, 32], 71, 'side');
    return [
        ...lashes('strands', [44, 35, 38], 52, 'soft'),
        ...lashes('shadow', [7, 7, 6], 22, 'upper'),
    ];
}
function lashReference(req) {
    const positions = {
        open: 'middle', cat: 'side', rounded: 'rounded',
    };
    const placement = positions[req.variant];
    if (!placement)
        throw new Error('Unknown user selected lash reference');
    return [
        ...lashes('shadow', [21, 19, 17], 62, placement),
        ...lashes('strands', req.primaryRGB, 23, placement),
    ];
}
function lashTint(req) {
    if (req.variant === 'lift')
        return lashes('strands', [32, 29, 30], 54, 'upper');
    if (req.variant === 'brown')
        return lashes('tint', [87, 66, 57], 56);
    return lashes('tint', [39, 38, 40], 72);
}
function clusterLashes(req) {
    if (req.variant === 'strip')
        return lashes('strands', [30, 27, 29], 74, 'upper');
    if (req.variant === 'cluster')
        return lashes('fibres', [37, 33, 36], 67);
    return lashes('shadow', [8, 7, 7], 37, 'soft');
}
function mascara(req) {
    if (req.variant === 'length')
        return lashes('strands', [35, 32, 34], 59, 'upper');
    if (req.variant === 'volume')
        return [
            ...lashes('shadow', [18, 17, 17], 72),
            ...lashes('strands', [37, 34, 33], 24),
        ];
    return lashes('tint', [95, 76, 73], 29, 'soft');
}
function eyelinerWing(req) {
    if (req.variant === 'short')
        return liner('tint', [50, 43, 49], 64, 'middle');
    if (req.variant === 'long')
        return liner('tint', [48, 40, 53], 77, 'side');
    return liner('blur', [0, 0, 0], 36, 'soft');
}
function graphicLiner(req) {
    if (req.variant === 'graphic')
        return [
            ...liner('tint', [51, 36, 69], 80),
            ...lids('shadow', [4, 4, 5], 20, 'side'),
        ];
    if (req.variant === 'smoke')
        return [
            ...liner('blur', [0, 0, 0], 57),
            ...lids('shadow', [12, 9, 12], 48, 'soft'),
        ];
    return liner('shadow', [24, 22, 24], 45, 'upper');
}
function shadowTechniques(req) {
    const colour = mixRGB(req.primaryRGB, req.secondaryRGB, req.mixPercent);
    if (req.variant === 'halo')
        return lids('tint', colour, 64, 'rounded');
    if (req.variant === 'crease')
        return lids('tint', colour, 58, 'upper');
    return lids('tint', colour, 39, 'soft');
}
function duochrome(req) {
    if (req.variant === 'foil')
        return [
            ...lids('tint', req.secondaryRGB, 44),
            ...lids('gloss', [6, 6, 6], 72, 'middle'),
        ];
    if (req.variant === 'duochrome')
        return [
            layer('lid_left', 'tint', req.primaryRGB, 53, 'side'),
            layer('lid_right', 'tint', req.secondaryRGB, 53, 'side'),
            ...lids('gloss', [3, 4, 5], 44),
        ];
    return lids('gloss', [4, 4, 4], 33, 'soft');
}
function irisColour(req) {
    const shades = {
        blue: [100, 142, 177], hazel: [158, 135, 91], violet: [139, 121, 166],
    };
    const color = shades[req.variant];
    if (!color)
        throw new Error('Unknown iris swatch');
    return pair('iris_left', 'iris_right', 'tint', color, 61);
}
function browTint(req) {
    const shades = {
        warm: [114, 83, 63], cool: [92, 93, 104], deep: [58, 48, 47],
    };
    const shade = shades[req.variant];
    if (!shade)
        throw new Error('Unknown brow shade');
    return brows('tint', shade, 66);
}
function browLamination(req) {
    if (req.variant === 'raised')
        return brows('strands', [62, 51, 46], 67, 'upper');
    if (req.variant === 'feathered')
        return brows('fibres', [72, 61, 54], 58, 'side');
    return brows('blur', [0, 0, 0], 30, 'soft');
}
function microblading(req) {
    const shade = mixRGB(req.primaryRGB, [75, 59, 56], 42);
    if (req.variant === 'hair-stroke')
        return brows('strands', shade, 63, 'side');
    if (req.variant === 'soft')
        return brows('tint', shade, 33);
    return [
        ...brows('strands', shade, 76),
        ...brows('shadow', [6, 5, 5], 21),
    ];
}
function nanoBrow(req) {
    const shade = mixRGB(req.primaryRGB, [96, 74, 66], 37);
    if (req.variant === 'powder')
        return brows('fibres', shade, 61);
    if (req.variant === 'nano')
        return brows('strands', shade, 54);
    return [
        ...brows('tint', shade, 34, 'upper'),
        ...brows('fibres', shade, 29, 'lower'),
    ];
}
function browReference(req) {
    const fields = {
        'soft-arch': 'rounded', straight: 'uniform', 'high-arch': 'upper',
    };
    const position = fields[req.variant];
    if (!position)
        throw new Error('Unknown brow placement');
    return [
        ...brows('shadow', [18, 15, 14], 53, position),
        ...brows('gloss', [4, 3, 3], 31, position),
    ];
}
function eyeTypeLayout(req) {
    if (req.variant === 'hooded')
        return [
            ...lids('tint', [155, 122, 153], 49, 'upper'),
            ...liner('shadow', [14, 11, 14], 48, 'side'),
        ];
    if (req.variant === 'monolid')
        return [
            ...lids('tint', [138, 123, 168], 54, 'middle'),
            ...liner('tint', [69, 58, 93], 46, 'upper'),
        ];
    return [
        ...lids('tint', [173, 141, 135], 43, 'rounded'),
        ...liner('blur', [0, 0, 0], 39, 'soft'),
    ];
}
function colorPair(req) {
    const shades = {
        plum: [108, 69, 116], navy: [74, 98, 147], bronze: [163, 120, 78],
    };
    const shade = shades[req.variant];
    if (!shade)
        throw new Error('Unknown cosmetic pairing');
    const mascara = mixRGB(shade, [64, 54, 56], 51);
    return [
        ...liner('tint', shade, 65),
        ...lashes('tint', mascara, 52),
    ];
}
const PLANS = {
    W59: lashExtension,
    W60: lashReference,
    W61: lashTint,
    W62: clusterLashes,
    W63: mascara,
    W64: eyelinerWing,
    W65: graphicLiner,
    W66: shadowTechniques,
    W67: duochrome,
    W68: irisColour,
    W69: browTint,
    W70: browLamination,
    W71: microblading,
    W72: nanoBrow,
    W73: browReference,
    W75: eyeTypeLayout,
    W76: colorPair,
};
export function eyeLayersFor(request) {
    const plan = PLANS[request.featureId];
    if (!plan)
        throw new Error('Unknown or blocked eye makeup feature');
    return plan(request);
}
