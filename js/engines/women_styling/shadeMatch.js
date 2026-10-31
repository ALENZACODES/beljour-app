const disclosure = 'Fictional RGB shade simulation; not a verified foundation match, ' +
    'skin analysis, undertone diagnosis, or product recommendation.';
export function checkedRGB(value) {
    if (!Array.isArray(value) || value.length !== 3 ||
        value.some(c => !Number.isInteger(c) || c < 0 || c > 255)) {
        throw new Error('RGB must contain three integer channels');
    }
    return [value[0], value[1], value[2]];
}
function linear(channel) {
    const unit = channel / 255;
    return unit <= .04045 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4;
}
function labF(value) {
    return value > 216 / 24389 ? value ** (1 / 3) : value * (24389 / 27) / 116 + 16 / 116;
}
export function proxyLab(rgb) {
    checkedRGB([...rgb]);
    const [r, g, b] = rgb.map(linear);
    const x = (r * .4124564 + g * .3575761 + b * .1804375) / .95047;
    const y = r * .2126729 + g * .7151522 + b * .0721750;
    const z = (r * .0193339 + g * .1191920 + b * .9503041) / 1.08883;
    const [fx, fy, fz] = [x, y, z].map(labF);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function colourDistance(a, b) {
    const lhs = proxyLab(a), rhs = proxyLab(b);
    return Math.hypot(...lhs.map((v, i) => v - rhs[i]));
}
export function matchTwoSwatches(target, catalogue, calibration = 'uncalibrated', calibrationError) {
    checkedRGB([...target]);
    if (!['uncalibrated', 'manual', 'instrument_calibrated'].includes(calibration)) {
        throw new Error('Unknown calibration provenance');
    }
    if (catalogue.length < 2 || catalogue.length > 24)
        throw new Error('Need 2..24 swatches');
    for (const shade of catalogue) {
        if (!/^[A-Za-z0-9_-]{1,24}$/.test(shade.code))
            throw new Error('Invalid swatch code');
        checkedRGB([...shade.rgb]);
    }
    if (new Set(catalogue.map(s => s.code)).size !== catalogue.length)
        throw new Error('Duplicate swatches');
    if (calibrationError !== undefined &&
        (!Number.isFinite(calibrationError) || calibrationError < 0 || calibrationError > 20)) {
        throw new Error('Invalid numeric calibration error');
    }
    const refuse = (reason) => ({
        status: 'REFUSE', reason, swatches: [], confidence_percent: 0,
        still_her_score: 100, provider_calls: 0, disclosure,
    });
    if (calibration !== 'instrument_calibrated' || calibrationError === undefined) {
        return refuse('A verified calibration workflow is required; manual display RGB cannot establish skin shade.');
    }
    if (calibrationError > 2)
        return refuse('Calibration error exceeds the display-proxy acceptance limit.');
    const targetL = proxyLab(target)[0];
    const ranked = catalogue.flatMap(shade => {
        const valueL = proxyLab(shade.rgb)[0];
        if (valueL > targetL + .01)
            return [];
        return [{ code: shade.code, rgb: shade.rgb, proxy_delta_e76: colourDistance(target, shade.rgb),
                proxy_depth_difference: valueL - targetL }];
    }).sort((a, b) => a.proxy_delta_e76 - b.proxy_delta_e76 || a.code.localeCompare(b.code));
    if (ranked.length < 2)
        return refuse('Fewer than two non-lightening display swatches are available.');
    if (ranked[0].proxy_delta_e76 > 14) {
        return refuse('Nearest fictional shade is too far from the supplied reference.');
    }
    const quality = Math.max(0, Math.min(100, Math.floor(100 - 9 * calibrationError - 2 * ranked[0].proxy_delta_e76)));
    return { status: 'TWO_SWATCH_TEST',
        reason: 'Compare both physical swatches against the original reference before choosing; no brand equivalence.',
        swatches: ranked.slice(0, 2), confidence_percent: quality,
        still_her_score: 100, provider_calls: 0, disclosure };
}
