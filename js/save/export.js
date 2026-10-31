/** Export with no metadata, and the "Beljour" album (round 2 plan §8 Quick save, test 19).
 * - Exports are re-encoded from pixels through a canvas, so the camera's EXIF never rides
 *   along; `stripJpegMetadata` then removes any APP1 (EXIF/XMP), APP13 (IPTC) or comment
 *   segment an encoder may add. "A beauty app leaking where a woman lives is a safety failure."
 * - File names follow Beljour_<LookName>_01, _02 ...; originals are never overwritten.
 * - In a browser there is no phone album, so "Save all" makes one zip named Beljour
 *   holding those files (stored, not compressed: JPEGs are compressed already). ASSUMED in
 *   round2-plan-binding §8 build notes.
 * Author: John Khan.
 */
import { PALETTE, withAlpha } from "../ui/palette.js";
export const ALBUM = "Beljour";
/** "Date Night" -> "DateNight"; safe for every file system. */
export function lookSlug(name) {
    const slug = (name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("").slice(0, 32);
    return slug || "Look";
}
export function fileName(lookName, index, extension = "jpg") {
    if (!Number.isInteger(index) || index < 1 || index > 999)
        throw new RangeError("photo number must be 1 to 999");
    return `Beljour_${lookSlug(lookName)}_${String(index).padStart(2, "0")}.${extension}`;
}
/** The JPEG marker segments before the image data (SOS). Throws on a damaged file. */
export function jpegSegments(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
        throw new RangeError("not a JPEG file");
    const out = [];
    let i = 2;
    while (i + 4 <= bytes.length) {
        if (bytes[i] !== 0xff)
            throw new RangeError("damaged JPEG: marker expected");
        const marker = bytes[i + 1];
        if (marker === 0xd9)
            break;
        const length = (bytes[i + 2] << 8) | bytes[i + 3];
        if (length < 2 || i + 2 + length > bytes.length)
            throw new RangeError("damaged JPEG: segment runs past the end");
        out.push({ marker, offset: i, length: length + 2 });
        if (marker === 0xda)
            break; // image data follows; stop
        i += 2 + length;
    }
    return out;
}
const STRIPPED = new Set([0xe1, 0xed, 0xfe]); // APP1 EXIF/XMP, APP13 IPTC, COM
export function hasMetadata(bytes) {
    return jpegSegments(bytes).some((s) => STRIPPED.has(s.marker) || (s.marker >= 0xe3 && s.marker <= 0xef));
}
/** Remove APP1, APP3-APP15 and COM segments; keep JFIF (APP0), the colour profile (APP2) and
 * everything needed to decode. Returns a new array; the input is untouched. */
export function stripJpegMetadata(bytes) {
    const segments = jpegSegments(bytes);
    const keep = [bytes.subarray(0, 2)];
    let end = 2;
    for (const s of segments) {
        const drop = STRIPPED.has(s.marker) || (s.marker >= 0xe3 && s.marker <= 0xef);
        if (s.marker === 0xda) {
            keep.push(bytes.subarray(s.offset));
            end = bytes.length;
            break;
        }
        if (!drop)
            keep.push(bytes.subarray(s.offset, s.offset + s.length));
        end = s.offset + s.length;
    }
    if (end < bytes.length && segments[segments.length - 1]?.marker !== 0xda)
        keep.push(bytes.subarray(end));
    const total = keep.reduce((n, k) => n + k.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const k of keep) {
        out.set(k, o);
        o += k.length;
    }
    return out;
}
export function labelText(options) {
    return options.simulationLabel && options.isSimulation ? "Simulation" : null;
}
export async function exportPhoto(pixels, encoder, options) {
    const quality = options.quality ?? 0.92;
    if (!(quality > 0 && quality <= 1))
        throw new RangeError("quality must be above 0 and at most 1");
    const label = labelText(options);
    const raw = await encoder.encode(pixels, { type: "image/jpeg", quality, label });
    return { name: fileName(options.lookName, options.index), bytes: stripJpegMetadata(raw), label };
}
/** The browser encoder: OffscreenCanvas, label drawn in the bottom-left corner. */
export function canvasEncoder() {
    return {
        async encode(pixels, { type, quality, label }) {
            const g = globalThis;
            if (!g.OffscreenCanvas || !g.ImageData)
                throw new Error("This browser cannot save photos locally.");
            const canvas = new g.OffscreenCanvas(pixels.width, pixels.height);
            const ctx = canvas.getContext("2d");
            if (!ctx)
                throw new Error("No 2D canvas is available.");
            const rgba = pixels.data.length === pixels.width * pixels.height * 4 ? new Uint8ClampedArray(pixels.data) : null;
            if (!rgba)
                throw new RangeError("export needs RGBA pixels");
            ctx.putImageData(new g.ImageData(rgba, pixels.width, pixels.height), 0, 0);
            if (label) {
                const size = Math.max(12, Math.round(pixels.width / 40));
                ctx.font = `600 ${size}px system-ui, sans-serif`;
                const pad = Math.round(size / 2), w = ctx.measureText(label).width + pad * 2;
                ctx.fillStyle = withAlpha(PALETTE.plum, 0.85); // burned into the saved image: fixed palette
                ctx.fillRect(pad, pixels.height - size * 2 - pad, w, size * 2);
                ctx.fillStyle = PALETTE.cream;
                ctx.fillText(label, pad * 2, pixels.height - size * 0.6 - pad);
            }
            const blob = await canvas.convertToBlob({ type, quality });
            return new Uint8Array(await blob.arrayBuffer());
        },
    };
}
// --- a minimal stored zip (no compression) -------------------------------------------------
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
export function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++)
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
/** A zip of files, stored without compression, with a fixed 1980-01-01 timestamp so the same
 * files always give the same bytes (and no hidden save time). */
export function storeZip(files) {
    const enc = new TextEncoder();
    const names = new Set();
    const local = [], central = [];
    let offset = 0;
    for (const f of files) {
        if (!/^[A-Za-z0-9_' .-]{1,120}(\/[A-Za-z0-9_.-]{1,80})?$/.test(f.name) || names.has(f.name))
            throw new RangeError(`bad or repeated file name ${f.name}`);
        names.add(f.name);
        const name = enc.encode(f.name), crc = crc32(f.bytes), size = f.bytes.length;
        const head = new Uint8Array(30 + name.length);
        const h = new DataView(head.buffer);
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x0800, true);
        h.setUint16(8, 0, true);
        h.setUint16(10, 0, true);
        h.setUint16(12, 0x21, true);
        h.setUint32(14, crc, true);
        h.setUint32(18, size, true);
        h.setUint32(22, size, true);
        h.setUint16(26, name.length, true);
        h.setUint16(28, 0, true);
        head.set(name, 30);
        const cen = new Uint8Array(46 + name.length);
        const c = new DataView(cen.buffer);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, 0, true);
        c.setUint16(12, 0, true);
        c.setUint16(14, 0x21, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, size, true);
        c.setUint32(24, size, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        cen.set(name, 46);
        local.push(head, f.bytes);
        central.push(cen);
        offset += head.length + size;
    }
    const centralSize = central.reduce((n, x) => n + x.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, centralSize, true);
    e.setUint32(16, offset, true);
    const parts = [...local, ...central, end];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
/** One zip for "Save all", plus her one confirmation line. */
/** The album zip; `part` numbers the files of a batch too big to hold in memory at once. */
export function album(files, part) {
    if (!files.length)
        throw new RangeError("nothing to save yet");
    if (part !== undefined && !(Number.isInteger(part) && part >= 1 && part <= 999))
        throw new RangeError("album part must be 1 to 999");
    const bytes = storeZip(files.map((f) => ({ name: `${ALBUM}/${f.name}`, bytes: f.bytes })));
    const n = files.length;
    const name = part === undefined ? "Beljour.zip" : `Beljour part ${part}.zip`;
    return { name, bytes, message: `${n} photo${n === 1 ? "" : "s"} saved to ${ALBUM}${part === undefined ? "" : `, part ${part}`}.` };
}
