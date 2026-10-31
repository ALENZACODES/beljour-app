/** E07 part 2: MI-GAN as another fill method, behind the registry gate.
 *
 * Inspiration: MI-GAN (Sargsyan et al., ICCV 2023; github.com/Picsart-AI-Research/MI-GAN)
 * for the crop-around-the-hole, 512 px generator and masked-input idea; concept only, no
 * code copied. Two tensor layouts are supported, chosen when the model is pinned:
 *  - "pipeline-uint8": the exported pipeline. The MI-GAN README states its inputs are a
 *    uint8 RGB image and a uint8 mask with 255 = known and 0 = hole, at any size. The
 *    NCHW order and a uint8 NCHW output are ASSUMED until the pinned file is inspected.
 *  - "generator-512": the bare generator. ASSUMED layout: float32 [1, 4, 512, 512] =
 *    (known - 0.5, R, G, B scaled to [-1, 1] and zeroed in the hole); output float32
 *    [1, 3, 512, 512] in [-1, 1].
 * The fill always works on a crop around the hole (hole box grown by half its size, at
 * least 128 px), and only hole pixels are written back, so Q1 holds by construction.
 * Any shape or type the layout does not expect is an error, and fill.ts's fillAny then
 * falls back to the R5 fill. The model itself is pending (Places2 data terms), so today
 * every call falls back; tests drive the full path with an injected fake runtime.
 * Author: John Khan.
 */
import { byteImage, requireColour, requireMask, resize, roundHalfEven } from "../../core/buffer.js";
import { SessionLoader, plainTensor } from "./runtime.js";
export const MIGAN_ID = "migan-512-places2";
export const VERSION = "fill-migan-wrapper-1.0.0";
export const GENERATOR_SIDE = 512;
export const LAYOUTS = ["pipeline-uint8", "generator-512"];
export const MARGIN_SHARE = 0.5, MIN_SIDE = 128;
/** Bounding box of hole pixels (alpha >= 0.5), or null when there is no hole. */
export function holeBox(hole) {
    let left = Infinity, top = Infinity, right = -1, bottom = -1;
    for (let y = 0; y < hole.height; y++)
        for (let x = 0; x < hole.width; x++) {
            if (hole.data[y * hole.width + x] >= 0.5) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
    return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}
/** A square crop centred on the hole: side = max(MIN_SIDE, (1 + 2 x margin) x larger hole side),
 * shifted to stay inside the photo and cut to the photo when the photo is smaller. */
export function cropBox(hole, marginShare = MARGIN_SHARE, minSide = MIN_SIDE) {
    const b = holeBox(hole);
    if (!b)
        return null;
    const side = Math.max(minSide, Math.ceil(Math.max(b.width, b.height) * (1 + 2 * marginShare)));
    const w = Math.min(side, hole.width), h = Math.min(side, hole.height);
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const left = Math.min(Math.max(0, Math.round(cx - w / 2)), hole.width - w);
    const top = Math.min(Math.max(0, Math.round(cy - h / 2)), hole.height - h);
    return { left, top, width: w, height: h };
}
export function cropImage(img, box) {
    requireColour(img);
    const out = byteImage(box.width, box.height, 3);
    for (let y = 0; y < box.height; y++)
        for (let x = 0; x < box.width; x++) {
            const src = ((box.top + y) * img.width + box.left + x) * img.channels, dst = (y * box.width + x) * 3;
            out.data[dst] = img.data[src];
            out.data[dst + 1] = img.data[src + 1];
            out.data[dst + 2] = img.data[src + 2];
        }
    return out;
}
/** 1 where the crop is a hole (alpha >= 0.5), else 0. */
export function cropHole(hole, box) {
    const out = new Uint8Array(box.width * box.height);
    for (let y = 0; y < box.height; y++)
        for (let x = 0; x < box.width; x++) {
            out[y * box.width + x] = hole.data[(box.top + y) * hole.width + box.left + x] >= 0.5 ? 1 : 0;
        }
    return out;
}
/** Nearest-sample resize of a 0/1 map (pixel centres aligned). */
export function resizeBinary(bits, width, height, toWidth, toHeight) {
    const out = new Uint8Array(toWidth * toHeight);
    for (let y = 0; y < toHeight; y++) {
        const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / toHeight));
        for (let x = 0; x < toWidth; x++)
            out[y * toWidth + x] = bits[sy * width + Math.min(width - 1, Math.floor((x + 0.5) * width / toWidth))];
    }
    return out;
}
/** Tensors for one crop. Pipeline: uint8 image [1,3,H,W] and mask [1,1,H,W] (255 known).
 * Generator: float32 [1,4,512,512] = (known - 0.5, masked RGB in [-1, 1]). */
export function buildFeeds(crop, hole, layout, make = plainTensor) {
    if (crop.channels !== 3 || hole.length !== crop.width * crop.height)
        throw new RangeError("crop and hole sizes differ");
    if (layout === "pipeline-uint8") {
        const n = crop.width * crop.height, image = new Uint8Array(3 * n), mask = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            for (let c = 0; c < 3; c++)
                image[c * n + i] = crop.data[i * 3 + c];
            mask[i] = hole[i] ? 0 : 255;
        }
        return { image: make("uint8", image, [1, 3, crop.height, crop.width]), mask: make("uint8", mask, [1, 1, crop.height, crop.width]),
            side: { width: crop.width, height: crop.height } };
    }
    if (layout !== "generator-512")
        throw new RangeError(`layout must be one of ${LAYOUTS.join(", ")}`);
    const s = GENERATOR_SIDE, n = s * s;
    const scaled = crop.width === s && crop.height === s ? crop : resize(crop, s, s);
    const bits = resizeBinary(hole, crop.width, crop.height, s, s);
    const input = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) {
        const known = bits[i] ? 0 : 1;
        input[i] = known - 0.5;
        for (let c = 0; c < 3; c++)
            input[(c + 1) * n + i] = (scaled.data[i * 3 + c] / 127.5 - 1) * known;
    }
    return { input: make("float32", input, [1, 4, s, s]), side: { width: s, height: s } };
}
/** The model's output as an RGB crop at the crop's own size (validated). */
export function decodeOutput(out, layout, width, height) {
    const d = out.dims;
    if (layout === "pipeline-uint8") {
        if (!(out.data instanceof Uint8Array) || d.length !== 4 || d[0] !== 1 || d[1] !== 3 || d[2] !== height || d[3] !== width) {
            throw new RangeError(`pipeline output must be uint8 [1,3,${height},${width}]`);
        }
        const n = width * height, img = byteImage(width, height, 3);
        for (let i = 0; i < n; i++)
            for (let c = 0; c < 3; c++)
                img.data[i * 3 + c] = out.data[c * n + i];
        return img;
    }
    const s = GENERATOR_SIDE;
    if (!(out.data instanceof Float32Array) || d.length !== 4 || d[0] !== 1 || d[1] !== 3 || d[2] !== s || d[3] !== s) {
        throw new RangeError(`generator output must be float32 [1,3,${s},${s}]`);
    }
    const n = s * s, img = byteImage(s, s, 3);
    for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++) {
            const v = out.data[c * n + i];
            if (!Number.isFinite(v))
                throw new RangeError("generator output must be finite");
            img.data[i * 3 + c] = Math.min(255, Math.max(0, roundHalfEven((v + 1) * 127.5)));
        }
    return width === s && height === s ? img : resize(img, width, height);
}
/** Write the filled crop into the hole pixels only; everything else stays byte-identical. */
export function compositeHole(img, holeBits, box, filled) {
    const out = { width: img.width, height: img.height, channels: img.channels, data: new Uint8Array(img.data) };
    for (let y = 0; y < box.height; y++)
        for (let x = 0; x < box.width; x++) {
            const k = y * box.width + x;
            if (!holeBits[k])
                continue;
            const dst = ((box.top + y) * img.width + box.left + x) * img.channels;
            for (let c = 0; c < 3; c++)
                out.data[dst + c] = filled.data[k * 3 + c];
        }
    return out;
}
/** MI-GAN through an approved session; plugs into fill.ts as the "mi-gan" method. */
export class MiganFill {
    method = "mi-gan";
    layout;
    loader;
    ort;
    constructor(loader, layout = "pipeline-uint8", ort = () => null) {
        if (!LAYOUTS.includes(layout))
            throw new RangeError(`layout must be one of ${LAYOUTS.join(", ")}`);
        this.loader = loader;
        this.layout = layout;
        this.ort = ort;
    }
    status() { return this.loader.status(); }
    async fill(img, hole) {
        requireColour(img);
        requireMask(hole, img.width, img.height);
        const box = cropBox(hole);
        if (!box)
            return { image: { ...img, data: new Uint8Array(img.data) }, hole, method: "mi-gan", holePixels: 0, details: {} };
        const session = await this.loader.load();
        const crop = cropImage(img, box), bits = cropHole(hole, box), runtime = this.ort();
        const feeds = buildFeeds(crop, bits, this.layout, runtime ? runtime.tensor.bind(runtime) : plainTensor);
        const names = session.inputNames;
        const inputs = this.layout === "pipeline-uint8"
            ? { [names[0] ?? "image"]: feeds.image, [names[1] ?? "mask"]: feeds.mask }
            : { [names[0] ?? "input"]: feeds.input };
        const result = await session.run(inputs);
        const output = result[session.outputNames[0] ?? Object.keys(result)[0]];
        if (!output)
            throw new RangeError("model returned no output");
        const filled = decodeOutput(output, this.layout, box.width, box.height);
        let count = 0;
        for (const v of bits)
            count += v;
        return { image: compositeHole(img, bits, box, filled), hole, method: "mi-gan", holePixels: count,
            details: { crop_left: box.left, crop_top: box.top, crop_width: box.width, crop_height: box.height } };
    }
}
/** The default MI-GAN fill: the registry entry is pending, so status() explains why it falls back. */
export function defaultMigan(ort = null) {
    return new MiganFill(new SessionLoader({ modelId: MIGAN_ID, ort }), "pipeline-uint8", () => ort);
}
