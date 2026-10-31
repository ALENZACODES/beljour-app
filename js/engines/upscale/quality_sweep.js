/** Browser synthetic quality structures for classical upscale. Author: John Khan. */
import { psnr, upscale } from "./index.js";
function synthetic(kind, size = 48) { const data = new Uint8ClampedArray(size * size * 3); for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
        const o = (y * size + x) * 3;
        let r = 0, g = 0, b = 0;
        if (kind === "diagonal") {
            const e = x > y ? 1 : 0;
            r = 55 + e * 140;
            g = 45 + e * 115;
            b = 50 + e * 90;
        }
        else if (kind === "checker") {
            const t = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
            r = 60 + t * 110;
            g = 55 + t * 90;
            b = 50 + t * 70;
        }
        else if (kind === "rings") {
            const radius = Math.hypot(x - size / 2, y - size / 2), wave = .5 + .5 * Math.sin(radius * .75);
            r = 50 + wave * 130;
            g = 55 + wave * 100;
            b = 65 + wave * 80;
        }
        else if (kind === "hairlike") {
            const wave = .5 + .5 * Math.sin(x * .9 + .6 * Math.sin(y * .35)), grad = y / Math.max(size - 1, 1);
            r = 45 + wave * 65 + grad * 25;
            g = 35 + wave * 52 + grad * 20;
            b = 30 + wave * 40 + grad * 15;
        }
        else if (kind === "skinlike") {
            const t = 3 * Math.sin(x * .55) + 2 * Math.cos(y * .47) + 1.5 * Math.sin((x + y) * .31);
            r = 125 + t;
            g = 87 + t * .8;
            b = 73 + t * .7;
        }
        else
            throw new RangeError("unknown structure");
        data[o] = Math.round(r);
        data[o + 1] = Math.round(g);
        data[o + 2] = Math.round(b);
    } return { width: size, height: size, channels: 3, data }; }
function boxDown(photo, scale) { const width = Math.floor(photo.width / scale), height = Math.floor(photo.height / scale), data = new Uint8ClampedArray(width * height * 3); for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let dy = 0; dy < scale; dy++)
                for (let dx = 0; dx < scale; dx++)
                    sum += photo.data[((y * scale + dy) * photo.width + x * scale + dx) * 3 + c];
            data[(y * width + x) * 3 + c] = Math.round(sum / (scale * scale));
        } return { width, height, channels: 3, data }; }
function nearest(photo, scale) { const width = photo.width * scale, height = photo.height * scale, data = new Uint8ClampedArray(width * height * 3); for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++)
            data[(y * width + x) * 3 + c] = photo.data[(Math.floor(y / scale) * photo.width + Math.floor(x / scale)) * 3 + c]; return { width, height, channels: 3, data }; }
function ringing(photo) { let max = 0; for (let y = 1; y < photo.height - 1; y++)
    for (let x = 1; x < photo.width - 1; x++) {
        const grey = (i) => (photo.data[i * 3] + photo.data[i * 3 + 1] + photo.data[i * 3 + 2]) / 3, i = y * photo.width + x, lap = Math.abs(4 * grey(i) - grey(i - 1) - grey(i + 1) - grey(i - photo.width) - grey(i + photo.width));
        max = Math.max(max, lap);
    } return max / 255; }
export function evaluateStructure(name, scale) { const truth = synthetic(name), low = boxDown(truth, scale), ours = upscale(low, scale, .45), baseline = nearest(low, scale), oursPsnr = psnr(truth, ours), baselinePsnr = psnr(truth, baseline), ring = ringing(ours); return { name, scale, oursPsnr, baselinePsnr, ringing: ring, passed: oursPsnr >= baselinePsnr && ring <= .75 }; }
export function qualitySweep() { const rows = []; for (const scale of [2, 4])
    for (const name of ["diagonal", "checker", "rings", "hairlike", "skinlike"])
        rows.push(evaluateStructure(name, scale)); return rows; }
