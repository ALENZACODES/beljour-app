/** W19–W27 original, masked, strictly local hair appearance plans.
 * No new hair geometry, product effect, condition or medical claim.
 * Author: John Khan.
 */
import { mixRGB } from './palette.js';
function layer(region, kind, color, opacity, placement = 'uniform', scale = 100) {
    if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100 ||
        !Number.isInteger(scale) || scale < 0 || scale > 100) {
        throw new Error('Invalid hair layer configuration');
    }
    return { region, kind, color, opacity, placement, scale };
}
function clipIn(req) {
    const shade = mixRGB(req.primaryRGB, req.secondaryRGB, req.mixPercent);
    if (req.variant === 'soft-volume')
        return [
            layer('hair', 'strands', shade, 38, 'lower'),
            layer('tips', 'tint', shade, 33, 'lower'),
        ];
    if (req.variant === 'long-ribbon')
        return [
            layer('hair', 'strands', shade, 61, 'side'),
            layer('tips', 'gloss', [6, 6, 5], 58, 'lower'),
        ];
    return [
        layer('hair', 'tint', shade, 38, 'side'),
        layer('tips', 'strands', shade, 39, 'side'),
    ];
}
function weft(req) {
    const tone = mixRGB(req.primaryRGB, req.secondaryRGB, 35);
    if (req.variant === 'tape')
        return [
            layer('hair', 'strands', tone, 56, 'upper'),
            layer('hair_left', 'shadow', [9, 7, 5], 38, 'side'),
            layer('hair_right', 'shadow', [9, 7, 5], 38, 'side'),
        ];
    if (req.variant === 'sew')
        return [
            layer('hair', 'strands', tone, 68, 'lower'),
            layer('hair_left', 'tint', tone, 28, 'lower'),
            layer('hair_right', 'tint', tone, 28, 'lower'),
        ];
    return [
        layer('hair', 'strands', tone, 26),
        layer('hair_left', 'gloss', [4, 4, 3], 22),
        layer('hair_right', 'gloss', [4, 4, 3], 22),
    ];
}
function topper(req) {
    const tone = mixRGB(req.primaryRGB, req.secondaryRGB, req.mixPercent);
    if (req.variant === 'feathered')
        return [
            layer('crown', 'strands', tone, 43, 'rounded'),
            layer('roots', 'tint', tone, 31, 'upper'),
        ];
    if (req.variant === 'dense')
        return [
            layer('crown', 'fibres', tone, 64, 'middle'),
            layer('roots', 'strands', tone, 56, 'upper'),
        ];
    return [
        layer('crown', 'tint', tone, 23, 'soft'),
        layer('roots', 'strands', tone, 24, 'soft'),
    ];
}
function wig(req) {
    if (req.variant === 'natural')
        return [
            layer('hair', 'tint', req.primaryRGB, 41),
            layer('fringe', 'gloss', [7, 7, 6], 40, 'side'),
        ];
    if (req.variant === 'bold')
        return [
            layer('hair', 'tint', req.secondaryRGB, 84),
            layer('fringe', 'tint', req.secondaryRGB, 56),
            layer('hair', 'strands', req.secondaryRGB, 27),
        ];
    return [
        layer('hair', 'tint', mixRGB(req.primaryRGB, req.secondaryRGB, 44), 48),
        layer('fringe', 'blur', [0, 0, 0], 27),
    ];
}
function rootTouchUp(req) {
    const tone = req.primaryRGB;
    if (req.variant === 'powder')
        return [
            layer('roots', 'fibres', tone, 66, 'upper'),
            layer('hairline', 'tint', tone, 34, 'soft'),
        ];
    if (req.variant === 'mist')
        return [
            layer('roots', 'tint', tone, 52, 'soft'),
            layer('hairline', 'strands', tone, 28, 'upper'),
        ];
    return [
        layer('roots', 'tint', tone, 24),
        layer('hairline', 'blur', [0, 0, 0], 26, 'soft'),
    ];
}
function scalpCover(req) {
    const tone = req.primaryRGB;
    if (req.variant === 'soft-shade')
        return [
            layer('scalp', 'tint', tone, 51, 'soft'),
            layer('hairline', 'tint', tone, 37, 'soft'),
        ];
    if (req.variant === 'fine-grain')
        return [
            layer('scalp', 'fibres', tone, 51),
            layer('hairline', 'strands', tone, 43, 'upper'),
        ];
    return [
        layer('scalp', 'tint', mixRGB(tone, [129, 108, 102], 54), 35),
        layer('hairline', 'tint', tone, 26),
    ];
}
function fibres(req) {
    const density = {
        sparse: 29, medium: 51, full: 76,
    };
    const opacity = density[req.variant];
    if (opacity === undefined)
        throw new Error('Invalid topical fibre variant');
    return [
        layer('scalp', 'fibres', req.primaryRGB, opacity),
        layer('crown', 'strands', req.primaryRGB, Math.round(opacity * 0.62), 'rounded'),
    ];
}
function tint(req) {
    const shade = mixRGB(req.primaryRGB, req.secondaryRGB, req.mixPercent);
    if (req.variant === 'soft')
        return [
            layer('hair', 'tint', shade, 45),
            layer('tips', 'tint', req.secondaryRGB, 27, 'lower'),
        ];
    if (req.variant === 'vivid')
        return [
            layer('hair', 'tint', req.secondaryRGB, 79),
            layer('tips', 'gloss', [6, 6, 6], 35, 'lower'),
        ];
    return [
        layer('hair', 'tint', shade, 31),
        layer('tips', 'blur', [0, 0, 0], 28, 'lower'),
    ];
}
function toner(req) {
    if (req.variant === 'cool')
        return [
            layer('hair', 'tint', [114, 130, 157], 28),
            layer('tips', 'gloss', [5, 6, 9], 35, 'lower'),
        ];
    if (req.variant === 'warm')
        return [
            layer('hair', 'tint', [182, 146, 116], 30),
            layer('tips', 'gloss', [8, 6, 3], 40, 'lower'),
        ];
    return [
        layer('hair', 'gloss', [6, 6, 6], 52),
        layer('tips', 'blur', [0, 0, 0], 21),
    ];
}
function moneyPiece(req) {
    const tone = mixRGB(req.primaryRGB, [208, 174, 147], 57);
    if (req.variant === 'soft')
        return [
            layer('hair_left', 'tint', tone, 38, 'side'),
            layer('hair_right', 'tint', tone, 38, 'side'),
        ];
    if (req.variant === 'contrast')
        return [
            layer('hair_left', 'tint', tone, 73, 'upper'),
            layer('hair_right', 'tint', tone, 73, 'upper'),
            layer('fringe', 'gloss', [6, 5, 4], 52),
        ];
    return [
        layer('hair_left', 'strands', tone, 49),
        layer('hair_right', 'strands', tone, 49),
        layer('fringe', 'tint', tone, 18),
    ];
}
function foilLayout(req) {
    const dark = mixRGB(req.primaryRGB, [78, 67, 64], 43);
    const bright = mixRGB(req.secondaryRGB, [211, 179, 143], 54);
    if (req.variant === 'lowlights')
        return [
            layer('hair', 'strands', dark, 69),
            layer('hair_left', 'shadow', [11, 8, 7], 39),
            layer('hair_right', 'shadow', [11, 8, 7], 39),
        ];
    if (req.variant === 'babylights')
        return [
            layer('hair', 'strands', bright, 41, 'upper'),
            layer('hair_left', 'gloss', [4, 4, 3], 37),
            layer('hair_right', 'gloss', [4, 4, 3], 37),
        ];
    return [
        layer('hair', 'strands', bright, 78, 'side'),
        layer('hair_left', 'tint', bright, 23, 'diagonal'),
        layer('hair_right', 'tint', bright, 23, 'diagonal'),
    ];
}
function chunkyHighlights(req) {
    const bright = mixRGB(req.secondaryRGB, [224, 186, 151], 34);
    if (req.variant === 'chunky')
        return [
            layer('hair', 'strands', bright, 83, 'side'),
            layer('tips', 'tint', bright, 35, 'lower'),
        ];
    if (req.variant === 'lived-in')
        return [
            layer('hair', 'strands', bright, 49, 'lower'),
            layer('tips', 'tint', bright, 59, 'lower'),
        ];
    return [
        layer('hair', 'tint', bright, 21),
        layer('tips', 'blur', [0, 0, 0], 28, 'lower'),
    ];
}
function greyBlend(req) {
    let tone;
    if (req.variant === 'silver')
        tone = [186, 193, 202];
    else if (req.variant === 'smoke')
        tone = [144, 147, 155];
    else
        tone = mixRGB(req.primaryRGB, [177, 172, 175], 45);
    return [
        layer('hair', 'tint', tone, 37, 'soft'),
        layer('roots', 'strands', tone, 48, 'upper'),
        layer('tips', 'gloss', [5, 5, 5], 27, 'lower'),
    ];
}
function greyStoryboard(req) {
    const mixtures = {
        early: 18, middle: 49, late: 82,
    };
    const percent = mixtures[req.variant];
    if (percent === undefined)
        throw new Error('Unsupported storyboard variant');
    const shade = mixRGB(req.primaryRGB, [188, 190, 190], percent);
    return [
        layer('roots', 'tint', shade, 61, 'upper'),
        layer('hair', 'strands', shade, 42),
        layer('tips', 'tint', shade, 27, 'lower'),
    ];
}
function colorMelt(req) {
    const middle = mixRGB(req.primaryRGB, req.secondaryRGB, 48);
    if (req.variant === 'seamless')
        return [
            layer('roots', 'tint', req.primaryRGB, 56, 'upper'),
            layer('hair', 'tint', middle, 43, 'diagonal'),
            layer('tips', 'tint', req.secondaryRGB, 65, 'lower'),
        ];
    if (req.variant === 'contrast')
        return [
            layer('roots', 'tint', req.primaryRGB, 70, 'upper'),
            layer('hair', 'strands', middle, 48),
            layer('tips', 'tint', req.secondaryRGB, 83, 'lower'),
        ];
    const cool = mixRGB(middle, [128, 139, 168], 42);
    return [
        layer('roots', 'tint', req.primaryRGB, 51),
        layer('hair', 'tint', cool, 43),
        layer('tips', 'gloss', [5, 6, 10], 53, 'lower'),
    ];
}
function splitDye(req) {
    const left = req.primaryRGB, right = req.secondaryRGB;
    if (req.variant === 'balanced')
        return [
            layer('hair_left', 'tint', left, 67),
            layer('hair_right', 'tint', right, 67),
            layer('fringe', 'strands', mixRGB(left, right, 50), 22),
        ];
    if (req.variant === 'left-bright')
        return [
            layer('hair_left', 'tint', left, 84, 'upper'),
            layer('hair_right', 'tint', right, 41),
            layer('fringe', 'gloss', [5, 5, 4], 35, 'side'),
        ];
    return [
        layer('hair_left', 'tint', left, 40),
        layer('hair_right', 'tint', right, 84, 'upper'),
        layer('fringe', 'strands', right, 34),
    ];
}
function peekaboo(req) {
    const accent = req.secondaryRGB;
    if (req.variant === 'underlayer')
        return [
            layer('hair', 'strands', accent, 24, 'lower'),
            layer('tips', 'tint', accent, 71, 'lower'),
        ];
    if (req.variant === 'side-slice')
        return [
            layer('hair_left', 'tint', accent, 62, 'side'),
            layer('hair_right', 'tint', accent, 48, 'side'),
        ];
    return [
        layer('tips', 'tint', accent, 32, 'soft'),
        layer('hair', 'blur', [0, 0, 0], 21, 'lower'),
    ];
}
function fringePreview(req) {
    const tone = mixRGB(req.primaryRGB, req.secondaryRGB, 31);
    if (req.variant === 'curtain')
        return [
            layer('fringe', 'strands', tone, 58, 'side'),
            layer('hairline', 'shadow', [8, 7, 7], 25, 'side'),
        ];
    if (req.variant === 'wispy')
        return [
            layer('fringe', 'strands', tone, 34, 'soft'),
            layer('hairline', 'blur', [0, 0, 0], 24),
        ];
    return [
        layer('fringe', 'tint', tone, 43, 'upper'),
        layer('hairline', 'strands', tone, 36),
    ];
}
function cutReference(req) {
    const tone = mixRGB(req.primaryRGB, [155, 130, 116], 34);
    if (req.variant === 'bob')
        return [
            layer('hair', 'gloss', [5, 5, 4], 49, 'lower'),
            layer('tips', 'strands', tone, 38, 'lower'),
        ];
    if (req.variant === 'crop')
        return [
            layer('fringe', 'tint', tone, 45, 'upper'),
            layer('hair', 'strands', tone, 44, 'upper'),
        ];
    return [
        layer('hair', 'strands', tone, 57, 'diagonal'),
        layer('tips', 'gloss', [6, 6, 5], 41, 'lower'),
    ];
}
function curlDefinition(req) {
    if (req.variant === 'definition')
        return [
            layer('hair', 'strands', req.primaryRGB, 37),
            layer('hair_left', 'gloss', [4, 4, 4], 26),
            layer('hair_right', 'gloss', [4, 4, 4], 26),
        ];
    if (req.variant === 'soft-frizz')
        return [
            layer('hair', 'blur', [0, 0, 0], 42),
            layer('hair_left', 'blur', [0, 0, 0], 29),
            layer('hair_right', 'blur', [0, 0, 0], 29),
        ];
    return [
        layer('hair', 'gloss', [6, 6, 6], 48),
        layer('hair_left', 'strands', req.primaryRGB, 19),
        layer('hair_right', 'strands', req.primaryRGB, 19),
    ];
}
function heatStyling(req) {
    if (req.variant === 'waves')
        return [
            layer('hair', 'strands', req.primaryRGB, 56, 'diagonal'),
            layer('tips', 'gloss', [5, 5, 5], 38, 'lower'),
        ];
    if (req.variant === 'straight')
        return [
            layer('hair', 'strands', req.primaryRGB, 41),
            layer('tips', 'blur', [0, 0, 0], 28),
        ];
    return [
        layer('hair', 'gloss', [8, 7, 6], 51, 'upper'),
        layer('tips', 'strands', req.primaryRGB, 31),
    ];
}
function humidityScenario(req) {
    if (req.variant === 'dry')
        return [
            layer('hair', 'gloss', [3, 3, 3], 43),
            layer('tips', 'strands', req.primaryRGB, 32),
        ];
    if (req.variant === 'humid')
        return [
            layer('hair', 'blur', [0, 0, 0], 37),
            layer('tips', 'strands', req.primaryRGB, 21, 'lower'),
        ];
    return [
        layer('hair', 'blur', [0, 0, 0], 55),
        layer('tips', 'gloss', [8, 8, 9], 44, 'lower'),
    ];
}
const PLANS = {
    W19: clipIn,
    W20: weft,
    W21: topper,
    W22: wig,
    W23: rootTouchUp,
    W24: scalpCover,
    W25: fibres,
    W26: tint,
    W27: toner,
    W29: moneyPiece,
    W30: foilLayout,
    W31: chunkyHighlights,
    W32: greyBlend,
    W33: greyStoryboard,
    W34: colorMelt,
    W35: splitDye,
    W36: peekaboo,
    W37: fringePreview,
    W38: cutReference,
    W40: curlDefinition,
    W43: heatStyling,
    W44: humidityScenario,
};
export function hairLayersFor(request) {
    const plan = PLANS[request.featureId];
    if (!plan)
        throw new Error(`Hair simulation not registered: ${request.featureId}`);
    return plan(request);
}
//# sourceMappingURL=hair_layers.js.map