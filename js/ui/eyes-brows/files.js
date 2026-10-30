/** Local import and labelled export; no storage or upload. Author: John Khan. */
import { browserDecoder, decodePhoto } from "../../image/decode.js";
import { MAX_PREVIEW_SIDE } from "./input.js";
import { PALETTE } from "../palette.js";
export async function openPhoto(file, signal) {
    if (file.size === 0 || file.size > 25 * 1024 * 1024)
        throw new RangeError("Choose a JPEG, PNG or WebP under 25 MB.");
    const photo = await decodePhoto(new Uint8Array(await file.arrayBuffer()), browserDecoder(), { signal });
    if (signal?.aborted)
        throw new DOMException("Photo import cancelled", "AbortError");
    const scale = Math.min(1, MAX_PREVIEW_SIDE / Math.max(photo.width, photo.height));
    const width = Math.round(photo.width * scale), height = Math.round(photo.height * scale);
    if (Math.min(width, height) < 16)
        throw new RangeError("This photo is too narrow for the local preview.");
    if (scale === 1)
        return { width, height, channels: 4, data: photo.data };
    const source = document.createElement("canvas");
    source.width = photo.width;
    source.height = photo.height;
    const input = source.getContext("2d");
    if (!input)
        throw new RangeError("A local canvas is unavailable.");
    input.putImageData(new ImageData(new Uint8ClampedArray(photo.data), photo.width, photo.height), 0, 0);
    const target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    const output = target.getContext("2d");
    if (!output)
        throw new RangeError("A local preview canvas is unavailable.");
    output.drawImage(source, 0, 0, width, height);
    const data = output.getImageData(0, 0, width, height).data;
    source.width = source.height = 1;
    target.width = target.height = 1;
    return { width, height, channels: 4, data };
}
export function rgbaData(image, pixels = image.data) {
    return new ImageData(new Uint8ClampedArray(pixels), image.width, image.height);
}
export function wrappedLines(text, width, measure) {
    if (!Number.isFinite(width) || width <= 0)
        throw new RangeError("Invalid label width.");
    const lines = [];
    let line = "";
    for (const word of text.replace(/[\r\n]+/g, " ").split(/\s+/)) {
        if (!word)
            continue;
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next) > width) {
            lines.push(line);
            line = word;
        }
        else
            line = next;
    }
    if (line)
        lines.push(line);
    return lines;
}
export async function exportLabelled(image, pixels, featureName, synthetic) {
    if (pixels.length !== image.data.length)
        throw new RangeError("The result is incomplete.");
    const canvas = document.createElement("canvas");
    // Small fixtures get a separate wider caption area; no label is clipped away.
    canvas.width = Math.max(image.width, 280);
    const context = canvas.getContext("2d");
    if (!context)
        throw new RangeError("Export canvas is unavailable.");
    context.font = "14px sans-serif";
    const caption = `BELJOUR · ${featureName} · Simulation. ${synthetic ? "Drawn fixture; no real person. " : ""}Real-face quality not verified. Author: John Khan.`;
    const lines = wrappedLines(caption, canvas.width - 24, text => context.measureText(text).width);
    canvas.height = image.height + 24 + lines.length * 19;
    context.fillStyle = PALETTE.cream;
    context.fillRect(0, 0, canvas.width, canvas.height); // saved file: fixed light palette
    context.putImageData(rgbaData(image, pixels), Math.floor((canvas.width - image.width) / 2), 0);
    context.fillStyle = PALETTE.plum;
    context.font = "14px sans-serif";
    lines.forEach((line, index) => context.fillText(line, 12, image.height + 20 + 19 * index));
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Export did not complete.")), "image/png"));
    canvas.width = canvas.height = 1;
    return blob;
}
export function download(blob, name) {
    if (!/^[a-z0-9-]+\.(png|json|svg|csv)$/.test(name))
        throw new RangeError("Invalid download filename.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
//# sourceMappingURL=files.js.map