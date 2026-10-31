/** Independent W4–W18 local finishing operations; mirrors Python operations.py.
 * Each layer is limited to one explicitly supplied mask. No provider calls.
 * Author: John Khan.
 */
import { mixRGB, pickSwatch, referenceFromOutfit } from './palette.js';
import { hairLayersFor } from './hair_layers.js';
import { eyeLayersFor } from './eye_layers.js';
const ZERO = [0, 0, 0];
function layer(region, kind, color, opacity, placement = 'uniform', scale = 100) {
    if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100 ||
        !Number.isInteger(scale) || scale < 0 || scale > 100) {
        throw new Error('Out-of-range layer controls');
    }
    return { region, kind, color, opacity, placement, scale };
}
function pair(a, b, kind, color, opacity, placement = 'uniform') {
    return [layer(a, kind, color, opacity, placement), layer(b, kind, color, opacity, placement)];
}
function w4(req) {
    const shade = pickSwatch(req.variant, req.depth);
    return pair('cheek_left', 'cheek_right', 'tint', shade.rgb, 49, 'soft');
}
function w5(req) {
    const color = referenceFromOutfit(req.outfitRGB, req.variant);
    const lip = mixRGB(color, [171, 102, 117], 38);
    return [
        layer('eyelid_left', 'tint', color, 57, 'upper'),
        layer('eyelid_right', 'tint', color, 57, 'upper'),
        layer('lips', 'tint', lip, 49),
    ];
}
function w7(req) {
    const tones = {
        brighten: [214, 184, 164], neutral: [177, 151, 141], warm: [199, 157, 124],
    };
    const color = tones[req.variant];
    if (!color)
        throw new Error('Unrecognized placement shade');
    return pair('under_eye_left', 'under_eye_right', 'tint', color, 57, 'upper');
}
function w8(req) {
    const shades = {
        peach: [220, 148, 119], green: [140, 168, 127], lavender: [178, 152, 194],
    };
    const shade = shades[req.variant];
    if (!shade)
        throw new Error('Unrecognized correction hue');
    return [
        ...pair('under_eye_left', 'under_eye_right', 'tint', shade, 39, 'soft'),
        ...pair('cheek_left', 'cheek_right', 'tint', shade, 29, 'soft'),
    ];
}
function w9(req) {
    if (req.variant === 'cream')
        return [
            layer('face', 'cream', ZERO, 88),
            layer('face', 'light', [6, 5, 4], 30, 'upper'),
        ];
    return [layer('face', 'powder', ZERO, 91), layer('face', 'grain', ZERO, 29, 'soft')];
}
function w10(req) {
    if (req.variant === 'dewy')
        return [
            layer('face', 'dewy', ZERO, 96, 'upper'),
            layer('face', 'light', [4, 3, 2], 44, 'middle'),
        ];
    if (req.variant === 'matte')
        return [
            layer('face', 'matte', ZERO, 90), layer('face', 'powder', ZERO, 53, 'soft'),
        ];
    return [layer('face', 'tint', [179, 146, 135], 16, 'soft'), layer('face', 'blur', ZERO, 38)];
}
function w11(req) {
    const places = { lifted: 'upper', rounded: 'rounded', soft: 'soft' };
    const position = places[req.variant];
    if (!position)
        throw new Error('Unknown blush placement');
    const shade = req.variant === 'soft' ? [196, 139, 141] : [187, 96, 114];
    return pair('cheek_left', 'cheek_right', 'tint', shade, 64, position);
}
function w12(req) {
    if (req.variant === 'bronze')
        return [
            ...pair('cheek_left', 'cheek_right', 'tint', [167, 115, 77], 45, 'side'),
            layer('jaw', 'light', [5, 2, 0], 30, 'lower'),
        ];
    if (req.variant === 'contour')
        return [
            ...pair('cheek_left', 'cheek_right', 'shadow', [20, 19, 17], 84, 'diagonal'),
            layer('jaw', 'shadow', [17, 16, 15], 76, 'lower'),
        ];
    return [
        ...pair('cheek_left', 'cheek_right', 'shadow', [11, 10, 8], 51, 'soft'),
        layer('jaw', 'shadow', [9, 8, 7], 45, 'lower'),
    ];
}
function w13(req) {
    const shade = req.variant === 'muted' ? mixRGB(req.referenceRGB, [136, 119, 118], 58) : req.referenceRGB;
    const lip = mixRGB(shade, [158, 93, 118], 30);
    return [
        ...pair('eyelid_left', 'eyelid_right', 'tint', shade, 60, 'upper'),
        ...pair('cheek_left', 'cheek_right', 'tint', shade, 28, 'soft'),
        layer('lips', 'tint', lip, 54),
    ];
}
function w15(req) {
    let eye, cheek, lip;
    if (req.variant === 'day') {
        eye = [161, 137, 128];
        cheek = [199, 133, 135];
        lip = [173, 109, 123];
    }
    else if (req.variant === 'evening') {
        eye = [111, 86, 125];
        cheek = [171, 94, 126];
        lip = [124, 72, 103];
    }
    else {
        eye = [176, 158, 153];
        cheek = [200, 158, 152];
        lip = [181, 127, 140];
    }
    return [
        ...pair('eyelid_left', 'eyelid_right', 'tint', eye, 54, 'upper'),
        ...pair('cheek_left', 'cheek_right', 'tint', cheek, 37, 'soft'),
        layer('lips', 'tint', lip, 64),
    ];
}
function w16(req) {
    const opacity = req.variant === 'minimal' ? 18 : 34;
    return [
        layer('face', 'blur', ZERO, opacity),
        ...pair('cheek_left', 'cheek_right', 'tint', [183, 134, 136], opacity, 'soft'),
        layer('lips', 'tint', [164, 112, 127], opacity),
    ];
}
function w17(req) {
    const shade = req.variant === 'warm_shift' ? [12, 10, 8] : [9, 9, 9];
    return [layer('face', 'colour_shift', shade, 80, 'uniform', Math.round(req.hours * 100 / 12))];
}
function w18(req) {
    const color = mixRGB(req.primaryRGB, req.secondaryRGB, req.mixPercent);
    const hints = {
        spring: [202, 151, 137], summer: [165, 142, 159],
        autumn: [173, 125, 102], winter: [152, 128, 142],
    };
    const hint = hints[req.variant];
    if (!hint)
        throw new Error('Unknown fictional season');
    const result = mixRGB(color, hint, 14);
    return [layer('face', 'tint', result, 51), layer('neck', 'tint', result, 37, 'upper')];
}
export function layersFor(req) {
    if (['W59', 'W60', 'W61', 'W62', 'W63', 'W64', 'W65', 'W66',
        'W67', 'W68', 'W69', 'W70', 'W71', 'W72', 'W73', 'W75', 'W76'].includes(req.featureId)) {
        return eyeLayersFor(req);
    }
    if (['W19', 'W20', 'W21', 'W22', 'W23', 'W24', 'W25', 'W26', 'W27',
        'W29', 'W30', 'W31', 'W32', 'W33', 'W34', 'W35', 'W36',
        'W37', 'W38', 'W40', 'W43', 'W44'].includes(req.featureId)) {
        return hairLayersFor(req);
    }
    const plans = {
        W4: w4, W5: w5, W7: w7, W8: w8, W9: w9, W10: w10, W11: w11,
        W12: w12, W13: w13, W15: w15, W16: w16, W17: w17, W18: w18,
    };
    const run = plans[req.featureId];
    if (!run)
        throw new Error('Unknown or blocked W feature');
    return run(req);
}
