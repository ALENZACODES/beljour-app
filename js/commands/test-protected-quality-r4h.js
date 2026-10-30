/** Protection-region browser tests with original synthetic masks.
 * Author: John Khan.
 */
import { measureProtectedRegions } from './protected-quality.js';
import { ProRenderError } from './runtime.js';
function check(value, label) {
    if (!value)
        throw new Error(`protected-quality ${label}`);
}
function picture(r, g = r, b = r) {
    const pixels = new Uint8Array(8 * 6 * 4);
    for (let i = 0; i < 8 * 6; i++)
        pixels.set([r, g, b, 255], i * 4);
    return { width: 8, height: 6, channels: 4, pixels };
}
function mask(category = 'skin') {
    const alpha = new Uint8Array(8 * 6);
    for (let y = 1; y < 5; y++) {
        for (let x = 1; x < 7; x++)
            alpha[y * 8 + x] = 255;
    }
    return { category, width: 8, height: 6, alpha, userChecked: true };
}
function rejected(code, operation) {
    try {
        operation();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`expected ${code}`);
}
export function testProtectedQualityR4H() {
    let count = 0;
    const before = picture(70);
    const untouched = measureProtectedRegions(before, before, [mask()], ['skin']);
    check(untouched.complete && untouched.readings[0]?.changedPixels === 0, 'neutral');
    check(untouched.realfacePass === false, 'no real-face claim');
    count += 2;
    const light = picture(180);
    const raised = measureProtectedRegions(before, light, [mask()], ['skin']);
    check(raised.readings[0]?.skinMaxLstarRise !== null &&
        (raised.readings[0]?.skinMaxLstarRise ?? 0) > 0, 'lightness rise');
    check(raised.readings[0]?.meanRgbDelta === 110, 'mean byte delta');
    check(raised.readings[0]?.boundaryLargestDelta === 110, 'boundary drift');
    count += 3;
    const dark = measureProtectedRegions(picture(180), picture(70), [mask()]);
    check((dark.readings[0]?.skinMaxLstarRise ?? 1) < 0, 'darkening');
    count++;
    const output = picture(70);
    output.pixels[(2 * 8 + 2) * 4 + 3] = 0;
    output.pixels[3] = 0;
    const alpha = measureProtectedRegions(before, output, [mask('protected')]);
    check(alpha.readings[0]?.alphaMismatchPixels === 1, 'only covered alpha counted');
    count++;
    const missing = measureProtectedRegions(before, before, [mask()], ['skin', 'hair']);
    check(!missing.complete && missing.missingCategories[0] === 'hair', 'missing evidence');
    count++;
    const unchecked = measureProtectedRegions(before, before, [{ ...mask(), userChecked: false }]);
    check(!unchecked.complete && unchecked.readings[0]?.referenceChecked === false, 'unchecked reference is not complete');
    count++;
    rejected('invalid_mask', () => measureProtectedRegions(before, before, [mask(), mask()]));
    count++;
    rejected('invalid_mask', () => measureProtectedRegions(before, before, [
        { ...mask(), alpha: new Uint8Array(1) },
    ]));
    count++;
    rejected('invalid_quality_frame', () => measureProtectedRegions(before, { width: 1, height: 1, channels: 4, pixels: new Uint8Array(4) }, []));
    count++;
    return count;
}
//# sourceMappingURL=test-protected-quality-r4h.js.map