/** Copy the camera details (EXIF) of her own original JPEG into the saved JPEG, in plain code on
 * this device. Nothing is invented: only the segment that was in her file is carried over, and
 * only these changes are made to it, each because the saved pixels differ from the original:
 * - Orientation is set to 1 (upright), because the photo is decoded upright before editing, so
 *   the saved pixels are already turned; keeping her original value would turn them twice.
 * - The pixel width and height fields (0xA002, 0xA003) are set to the saved size when present.
 * - The embedded thumbnail is blanked and unlinked, because it shows the unedited photo.
 * - Location (the GPS block) is blanked, so a shared edit does not carry where she was. The date
 *   taken, camera make and model, lens, exposure and the other camera fields stay as they were.
 * Browsers cannot write HEIC, so the save is always a JPEG; a HEIC, PNG or WebP original has no
 * JPEG EXIF segment here, and then nothing is copied. Author: John Khan.
 */
export const ORIENTATION = 0x0112;
export const EXIF_IFD = 0x8769;
export const GPS_IFD = 0x8825;
export const PIXEL_X = 0xa002;
export const PIXEL_Y = 0xa003;
export const THUMB_OFFSET = 0x0201;
export const THUMB_LENGTH = 0x0202;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
/** The APP1 Exif payload ("Exif\0\0" + TIFF) of a JPEG, or null when there is none. */
export function readExif(jpeg) {
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8)
        return null;
    let p = 2;
    while (p + 4 <= jpeg.length) {
        if (jpeg[p] !== 0xff)
            return null;
        const marker = jpeg[p + 1];
        if (marker === 0xff) {
            p++;
            continue;
        }
        if (marker === 0xda || marker === 0xd9)
            return null; // image data starts: no EXIF before it
        const len = (jpeg[p + 2] << 8) | jpeg[p + 3];
        if (len < 2 || p + 2 + len > jpeg.length)
            return null;
        if (marker === 0xe1 && len >= 8 && EXIF_HEADER.every((b, i) => jpeg[p + 4 + i] === b))
            return jpeg.slice(p + 4, p + 2 + len);
        p += 2 + len;
    }
    return null;
}
class Tiff {
    b;
    base;
    le;
    constructor(b, base) {
        this.b = b;
        this.base = base;
        const o = String.fromCharCode(b[base], b[base + 1]);
        if (o !== "II" && o !== "MM")
            throw new RangeError("not a TIFF header");
        this.le = o === "II";
        if (this.u16(2) !== 42)
            throw new RangeError("not a TIFF header");
    }
    ok(off, n) { return off >= 0 && this.base + off + n <= this.b.length; }
    u16(off) { const i = this.base + off; return this.le ? this.b[i] | (this.b[i + 1] << 8) : (this.b[i] << 8) | this.b[i + 1]; }
    u32(off) {
        const i = this.base + off, b = this.b;
        return (this.le ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) : ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])) >>> 0;
    }
    set16(off, v) { const i = this.base + off; if (this.le) {
        this.b[i] = v & 255;
        this.b[i + 1] = v >> 8;
    }
    else {
        this.b[i] = v >> 8;
        this.b[i + 1] = v & 255;
    } }
    set32(off, v) {
        const i = this.base + off, s = this.le ? [0, 8, 16, 24] : [24, 16, 8, 0];
        for (let k = 0; k < 4; k++)
            this.b[i + k] = (v >>> s[k]) & 255;
    }
    zero(off, n) { if (this.ok(off, n))
        this.b.fill(0, this.base + off, this.base + off + n); }
    entries(ifd) {
        if (!this.ok(ifd, 2))
            return [];
        const n = this.u16(ifd), out = [];
        if (!this.ok(ifd + 2, n * 12 + 4))
            return [];
        for (let k = 0; k < n; k++) {
            const at = ifd + 2 + k * 12, type = this.u16(at + 2), count = this.u32(at + 4), size = (TYPE_SIZE[type] ?? 1) * count;
            out.push({ at, tag: this.u16(at), type, count, valueAt: size <= 4 ? at + 8 : this.u32(at + 8) });
        }
        return out;
    }
    next(ifd) { const n = this.u16(ifd); return this.ok(ifd + 2 + n * 12, 4) ? this.u32(ifd + 2 + n * 12) : 0; }
    setNext(ifd, v) { this.set32(ifd + 2 + this.u16(ifd) * 12, v); }
    num(e) { return e.type === 3 ? this.u16(e.at + 8) : this.u32(e.at + 8); }
    setNumber(e, v) { if (e.type === 3)
        this.set16(e.at + 8, v);
    else if (e.type === 4)
        this.set32(e.at + 8, v); }
}
/** Her EXIF payload adjusted for the saved photo (see the file note). Returns a new array; the
 * input is not changed. Returns null when the payload cannot be read safely. */
export function exifForSave(payload, width, height) {
    const out = payload.slice();
    let t;
    try {
        t = new Tiff(out, 6);
    }
    catch {
        return null;
    }
    const ifd0 = t.u32(4);
    if (!t.ok(ifd0, 2))
        return null;
    for (const e of t.entries(ifd0)) {
        if (e.tag === ORIENTATION)
            t.setNumber(e, 1);
        if (e.tag === EXIF_IFD) {
            for (const x of t.entries(t.u32(e.at + 8))) {
                if (x.tag === PIXEL_X)
                    t.setNumber(x, width);
                if (x.tag === PIXEL_Y)
                    t.setNumber(x, height);
            }
        }
        if (e.tag === GPS_IFD) {
            const gps = t.u32(e.at + 8);
            for (const g of t.entries(gps)) {
                const size = (TYPE_SIZE[g.type] ?? 1) * g.count;
                if (size > 4)
                    t.zero(g.valueAt, size);
            }
            if (t.ok(gps, 2)) {
                const n = t.u16(gps);
                t.zero(gps + 2, n * 12);
                t.set16(gps, 0);
            }
        }
    }
    const ifd1 = t.next(ifd0);
    if (ifd1 && t.ok(ifd1, 2)) {
        const list = t.entries(ifd1);
        const off = list.find((e) => e.tag === THUMB_OFFSET), len = list.find((e) => e.tag === THUMB_LENGTH);
        if (off && len) {
            t.zero(t.num(off), t.num(len));
        }
        t.zero(ifd1 + 2, t.u16(ifd1) * 12 + 4);
        t.set16(ifd1, 0);
        t.setNext(ifd0, 0);
    }
    return out;
}
/** A JPEG with her (adjusted) EXIF placed straight after the start marker, as cameras write it.
 * The browser's own JFIF marker is dropped, so the file opens like a camera photo. */
export function withExif(jpeg, payload) {
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8)
        throw new RangeError("not a JPEG");
    if (payload.length + 2 > 0xffff)
        throw new RangeError("EXIF segment too large");
    let rest = 2;
    if (jpeg[2] === 0xff && jpeg[3] === 0xe0)
        rest = 4 + ((jpeg[4] << 8) | jpeg[5]);
    const len = payload.length + 2, out = new Uint8Array(2 + 2 + len + (jpeg.length - rest));
    out.set([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255]);
    out.set(payload, 6);
    out.set(jpeg.subarray(rest), 6 + payload.length);
    return out;
}
/** Copy her original's EXIF into the saved JPEG; the saved JPEG is returned unchanged when her
 * original has none (nothing is invented). */
export function copyExif(original, saved, width, height) {
    const payload = readExif(original);
    const adjusted = payload && exifForSave(payload, width, height);
    return adjusted ? { bytes: withExif(saved, adjusted), copied: true } : { bytes: saved, copied: false };
}
