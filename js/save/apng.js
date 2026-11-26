/** A small PNG / animated PNG encoder for stickers: RGBA, 8 bits, every frame full size.
 * Compression is "stored" deflate (no compression), which needs no library and keeps the bytes
 * exactly reproducible; stickers are small, so the files stay a few megabytes at most. A single
 * frame is a plain PNG. No text, time or other metadata chunk is written.
 * Author: John Khan.
 */
import { crc32 } from "./export.js";
export const MAX_BYTES = 24 * 1024 * 1024;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n) { return [(n >>> 8) & 255, n & 255]; }
function chunk(type, body) {
    const out = new Uint8Array(12 + body.length);
    out.set(u32(body.length), 0);
    for (let i = 0; i < 4; i++)
        out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    out.set(u32(crc32(out.subarray(4, 8 + body.length))), 8 + body.length);
    return out;
}
function adler32(bytes) {
    let a = 1, b = 0;
    for (let i = 0; i < bytes.length; i++) {
        a = (a + bytes[i]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}
/** zlib stream of stored deflate blocks (each at most 65535 bytes). */
export function zlibStored(raw) {
    const blocks = Math.max(1, Math.ceil(raw.length / 65535));
    const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
    out[0] = 0x78;
    out[1] = 0x01;
    let o = 2;
    for (let b = 0; b < blocks; b++) {
        const start = b * 65535, len = Math.min(65535, raw.length - start);
        out[o++] = b === blocks - 1 ? 1 : 0;
        out[o++] = len & 255;
        out[o++] = len >>> 8;
        out[o++] = ~len & 255;
        out[o++] = (~len >>> 8) & 255;
        out.set(raw.subarray(start, start + len), o);
        o += len;
    }
    out.set(u32(adler32(raw)), o);
    return out;
}
function scanlines(f) {
    const row = f.width * 4, raw = new Uint8Array((row + 1) * f.height);
    for (let y = 0; y < f.height; y++) {
        raw[y * (row + 1)] = 0;
        raw.set(f.data.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
    }
    return raw;
}
/** PNG for one frame, APNG for several (looping forever at `fps`). */
export function encodePng(frames, fps = 12) {
    if (!frames.length)
        throw new RangeError("no frames to encode");
    const { width, height } = frames[0];
    if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0))
        throw new RangeError("bad frame size");
    for (const f of frames)
        if (f.width !== width || f.height !== height || f.data.length !== width * height * 4)
            throw new RangeError("every frame must be the same RGBA size");
    if (!(Number.isInteger(fps) && fps >= 1 && fps <= 60))
        throw new RangeError("fps is 1 to 60");
    const parts = [Uint8Array.from(SIGNATURE), chunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0])];
    const animated = frames.length > 1;
    if (animated)
        parts.push(chunk("acTL", [...u32(frames.length), ...u32(0)]));
    let seq = 0;
    frames.forEach((f, i) => {
        if (animated)
            parts.push(chunk("fcTL", [...u32(seq++), ...u32(width), ...u32(height), ...u32(0), ...u32(0), ...u16(1), ...u16(fps), 0, 0]));
        const data = zlibStored(scanlines(f));
        if (i === 0)
            parts.push(chunk("IDAT", data));
        else {
            const body = new Uint8Array(4 + data.length);
            body.set(u32(seq++), 0);
            body.set(data, 4);
            parts.push(chunk("fdAT", body));
        }
    });
    parts.push(chunk("IEND", []));
    const total = parts.reduce((n, p) => n + p.length, 0);
    if (total > MAX_BYTES)
        throw new RangeError("this sticker would be too large; use fewer frames or a smaller size");
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
//# sourceMappingURL=apng.js.map