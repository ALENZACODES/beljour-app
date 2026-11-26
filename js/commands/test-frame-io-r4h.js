/** Image payload boundary checks using synthetic buffers only. Author: John Khan. */
import { ALLOWED_INPUT_TYPES, MAX_IMPORT_BYTES, clonePixels, fromRgba, toRgba, uiPreviewPixels, validateImport, } from './frame-io.js';
import { ProRenderError } from './runtime.js';
function check(value, label) {
    if (!value)
        throw new Error(`frame-io ${label}`);
}
function rejects(code, fn) {
    try {
        fn();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`expected ${code}`);
}
export function testFrameIo() {
    let count = 0;
    const input = {
        width: 2, height: 2, channels: 3,
        pixels: new Uint8Array([0, 1, 2, 40, 50, 60, 255, 200, 2, 4, 5, 6]),
    };
    const rgba = toRgba(input);
    check(rgba.length === 16 && rgba[3] === 255 && rgba[15] === 255, 'RGB expands with opaque alpha');
    count++;
    const imageData = {
        width: 2, height: 2, data: rgba,
    };
    const roundtrip = fromRgba(imageData, 3);
    check(roundtrip.pixels.every((value, index) => value === input.pixels[index]), 'source RGB bytes round-trip');
    count++;
    const copy = clonePixels(input);
    copy.pixels[0] = 250;
    check(input.pixels[0] === 0, 'cloning does not share backing data');
    count++;
    const rgbAlpha = {
        width: 1, height: 1, channels: 4, pixels: new Uint8Array([2, 3, 4, 11]),
    };
    const preserved = toRgba(rgbAlpha);
    check(preserved[3] === 11, 'alpha preserved');
    count++;
    for (const kind of ALLOWED_INPUT_TYPES) {
        validateImport(new Blob([new Uint8Array([1, 2, 3])], { type: kind }));
        count++;
    }
    const scaled = uiPreviewPixels({
        width: 2048, height: 1024, channels: 3,
        pixels: new Uint8Array(2048 * 1024 * 3),
    });
    check(scaled.width === 512 && scaled.height === 256, '512 display edge bound');
    check(scaled.rgba.byteLength === 512 * 256 * 4, 'display memory bound');
    count += 2;
    const tiny = uiPreviewPixels(input);
    check(tiny.width === 2 && tiny.height === 2, 'small source not upscaled');
    check(tiny.rgba[3] === 255, 'display alpha correct');
    count += 2;
    rejects('invalid_preview_size', () => uiPreviewPixels(input, 10));
    count++;
    rejects('unsupported_photo', () => validateImport(new Blob(['text'], { type: 'text/plain' })));
    count++;
    rejects('photo_size', () => validateImport(new Blob([], { type: 'image/png' })));
    count++;
    rejects('photo_size', () => validateImport(new Blob([
        new Uint8Array(MAX_IMPORT_BYTES + 1),
    ], { type: 'image/png' })));
    count++;
    rejects('invalid_photo', () => fromRgba({
        width: 1, height: 2, data: new Uint8ClampedArray(1),
    }));
    count++;
    return count;
}
//# sourceMappingURL=test-frame-io-r4h.js.map