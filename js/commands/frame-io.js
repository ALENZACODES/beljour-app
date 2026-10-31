/** On-device photo import and metadata-free PNG export for Pro Commands.
 * The source Blob and oriented bitmap are never uploaded or persisted.
 * Author: John Khan.
 */
import { ProRenderError, checkedFrame } from './runtime.js';
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
export const ALLOWED_INPUT_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp',
]);
export function clonePixels(frame) {
    checkedFrame(frame);
    return {
        width: frame.width,
        height: frame.height,
        channels: frame.channels,
        pixels: new Uint8Array(frame.pixels),
    };
}
export function toRgba(frame) {
    checkedFrame(frame);
    const result = new Uint8ClampedArray(frame.width * frame.height * 4);
    for (let pixel = 0; pixel < frame.width * frame.height; pixel++) {
        const inOffset = pixel * frame.channels;
        const outOffset = pixel * 4;
        result[outOffset] = frame.pixels[inOffset];
        result[outOffset + 1] = frame.pixels[inOffset + 1];
        result[outOffset + 2] = frame.pixels[inOffset + 2];
        result[outOffset + 3] = frame.channels === 4 ? frame.pixels[inOffset + 3] : 255;
    }
    return result;
}
/** Produce a bounded display tile without allocating a full-size RGBA copy. */
export function uiPreviewPixels(frame, maximumEdge = 512) {
    checkedFrame(frame);
    if (!Number.isInteger(maximumEdge) || maximumEdge < 32 || maximumEdge > 2048) {
        throw new ProRenderError('invalid_preview_size', 'Display size must be 32 to 2048 pixels.');
    }
    const scale = Math.min(1, maximumEdge / Math.max(frame.width, frame.height));
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        const originalY = Math.min(frame.height - 1, Math.floor((y + 0.5) * frame.height / height));
        for (let x = 0; x < width; x++) {
            const originalX = Math.min(frame.width - 1, Math.floor((x + 0.5) * frame.width / width));
            const from = (originalY * frame.width + originalX) * frame.channels;
            const to = (y * width + x) * 4;
            rgba[to] = frame.pixels[from];
            rgba[to + 1] = frame.pixels[from + 1];
            rgba[to + 2] = frame.pixels[from + 2];
            rgba[to + 3] = frame.channels === 4 ? frame.pixels[from + 3] : 255;
        }
    }
    return { width, height, rgba };
}
export function fromRgba(data, channels = 4) {
    if (!Number.isInteger(data.width) || !Number.isInteger(data.height) ||
        data.width < 1 || data.height < 1 ||
        data.width * data.height > 24_000_000 ||
        data.data.length !== data.width * data.height * 4) {
        throw new ProRenderError('invalid_photo', 'Decoded photo dimensions are invalid.');
    }
    const pixels = new Uint8Array(data.width * data.height * channels);
    for (let pixel = 0; pixel < data.width * data.height; pixel++) {
        const input = pixel * 4;
        const output = pixel * channels;
        pixels[output] = data.data[input];
        pixels[output + 1] = data.data[input + 1];
        pixels[output + 2] = data.data[input + 2];
        if (channels === 4)
            pixels[output + 3] = data.data[input + 3];
    }
    return checkedFrame({ width: data.width, height: data.height, channels, pixels });
}
export function validateImport(file) {
    if (!(file instanceof Blob) || !ALLOWED_INPUT_TYPES.has(file.type)) {
        throw new ProRenderError('unsupported_photo', 'Choose JPEG, PNG or WebP.');
    }
    if (file.size < 1 || file.size > MAX_IMPORT_BYTES) {
        throw new ProRenderError('photo_size', 'Photo must be 16 MB or less.');
    }
}
export class BrowserPhotoCodec {
    async decode(file) {
        validateImport(file);
        if (typeof createImageBitmap !== 'function') {
            throw new ProRenderError('decoder_unavailable', 'Local image decoding is unavailable.');
        }
        let bitmap;
        try {
            bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        }
        catch {
            throw new ProRenderError('photo_decode_failed', 'This photo could not be opened.');
        }
        try {
            if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 24_000_000) {
                throw new ProRenderError('photo_dimensions', 'Photo exceeds the 24 MP limit.');
            }
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (context === null) {
                throw new ProRenderError('canvas_unavailable', 'Local photo canvas is unavailable.');
            }
            context.drawImage(bitmap, 0, 0);
            return fromRgba(context.getImageData(0, 0, bitmap.width, bitmap.height));
        }
        finally {
            bitmap.close();
        }
    }
    async encodePng(frame) {
        checkedFrame(frame);
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext('2d');
        if (context === null) {
            throw new ProRenderError('canvas_unavailable', 'PNG encoder is unavailable.');
        }
        context.putImageData(new ImageData(toRgba(frame), frame.width, frame.height), 0, 0);
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((value) => {
                if (value === null)
                    reject(new ProRenderError('export_failed', 'PNG export failed.'));
                else
                    resolve(value);
            }, 'image/png');
        });
        if (blob.type !== 'image/png' || blob.size === 0) {
            throw new ProRenderError('invalid_export', 'PNG export returned invalid bytes.');
        }
        return blob;
    }
}
export function downloadLocalPng(blob, filename = 'beljour-edit.png') {
    if (blob.type !== 'image/png' || blob.size === 0 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.png$/.test(filename)) {
        throw new ProRenderError('invalid_export', 'PNG download has invalid metadata.');
    }
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
