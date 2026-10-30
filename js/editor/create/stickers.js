/** The sticker library: picture packs, Beljour's drawn stickers and her own photo cut out.
 *
 * Packs are PNG files in web/assets/stickers/<pack>/<name>.png. scripts/copy-static.mjs lists the
 * files really there at build time (sticker-assets.ts), so the library never asks for a file that
 * doesn't exist and makes no request to find out. docs/STICKER-ART-LIST.md names the art.
 * Drawn stickers are our own simple shapes drawn by code, so the library is never empty; a
 * cut-out is the sticker made from her edited photo by save/sticker.ts (a real mask only).
 * Author: John Khan.
 */
import { PALETTE, PHOTO_MARK } from "../../ui/palette.js";
import { STICKER_FILES } from "./sticker-assets.js";
import { roundedRect } from "./shapes.js";
export const PACKS = {
    hearts: "Hearts", sparkles: "Sparkles", flowers: "Flowers", cafe: "Café doodles", beauty: "Beauty", bubbles: "Bubbles and badges",
};
export const PACK_IDS = Object.keys(PACKS);
export const STICKER_DIR = "assets/stickers";
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+){0,5}$/;
/** A pack file name ("hearts/heart-puffy.png") as a source, or null when it isn't one. */
export function packFile(file) {
    const m = /^([a-z]+)\/([a-z0-9-]+)\.png$/.exec(file);
    if (!m || !(m[1] in PACKS) || !NAME.test(m[2]))
        return null;
    return { pack: m[1], name: m[2] };
}
export function packUrl(pack, name) { return `${STICKER_DIR}/${pack}/${name}.png`; }
export function checkStickerSource(s) {
    if (s.kind === "cutout") {
        if (!/^cutout-[0-9]{1,4}$/.test(s.asset))
            throw new RangeError("Unknown cut-out");
        return;
    }
    if (!(s.pack in PACKS) || !NAME.test(s.name))
        throw new RangeError("Unknown sticker");
    if (s.kind === "drawn" && !DRAWN.some((d) => d.name === s.name && d.pack === s.pack))
        throw new RangeError("Unknown drawn sticker");
    if (s.kind !== "drawn" && s.kind !== "pack")
        throw new RangeError("Unknown sticker kind");
}
const { plum, plumDeep, blush, cream, wine, ink } = PALETTE;
const amber = PHOTO_MARK.second;
const OUT = 0.035; // outline width in box units
function outlined(p, fill, line = cream) { p.fillStyle = fill; p.fill(); p.lineWidth = OUT; p.strokeStyle = line; p.lineJoin = "round"; p.stroke(); }
function heartPath(p, s = 1) {
    p.beginPath();
    p.moveTo(0, 0.32 * s);
    p.bezierCurveTo(-0.5 * s, -0.02 * s, -0.36 * s, -0.42 * s, 0, -0.2 * s);
    p.bezierCurveTo(0.36 * s, -0.42 * s, 0.5 * s, -0.02 * s, 0, 0.32 * s);
    p.closePath();
}
function starPath(p, points, outer, inner) {
    p.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer, a = -Math.PI / 2 + i * Math.PI / points;
        if (i)
            p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else
            p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.closePath();
}
function sparklePath(p, r) {
    p.beginPath();
    p.moveTo(0, -r);
    p.quadraticCurveTo(0, 0, r, 0);
    p.quadraticCurveTo(0, 0, 0, r);
    p.quadraticCurveTo(0, 0, -r, 0);
    p.quadraticCurveTo(0, 0, 0, -r);
    p.closePath();
}
export const DRAWN = [
    { pack: "hearts", name: "heart", label: "Heart", aspect: 0.86, draw: (p) => { p.save(); p.scale(1.15, 1.15); heartPath(p); outlined(p, wine); p.restore(); } },
    { pack: "hearts", name: "heart-pair", label: "Two hearts", aspect: 0.8, draw: (p) => {
            p.save();
            p.translate(-0.14, 0.02);
            p.rotate(-0.25);
            p.scale(0.8, 0.8);
            heartPath(p);
            outlined(p, blush, plum);
            p.restore();
            p.save();
            p.translate(0.16, -0.02);
            p.rotate(0.2);
            p.scale(0.8, 0.8);
            heartPath(p);
            outlined(p, wine);
            p.restore();
        } },
    { pack: "hearts", name: "heart-line", label: "Heart outline", aspect: 0.86, draw: (p) => {
            p.save();
            p.scale(1.1, 1.1);
            heartPath(p);
            p.lineWidth = 0.07;
            p.strokeStyle = plum;
            p.lineJoin = "round";
            p.stroke();
            p.restore();
        } },
    { pack: "sparkles", name: "sparkle", label: "Sparkle", aspect: 1, draw: (p) => { sparklePath(p, 0.48); outlined(p, amber); } },
    { pack: "sparkles", name: "sparkle-trio", label: "Three sparkles", aspect: 1, draw: (p) => {
            for (const [x, y, r] of [[-0.12, 0.08, 0.32], [0.26, -0.24, 0.17], [0.3, 0.3, 0.12]]) {
                p.save();
                p.translate(x, y);
                sparklePath(p, r);
                outlined(p, cream, amber);
                p.restore();
            }
        } },
    { pack: "sparkles", name: "star", label: "Star", aspect: 1, draw: (p) => { starPath(p, 5, 0.48, 0.2); outlined(p, amber, plum); } },
    { pack: "flowers", name: "daisy", label: "Daisy", aspect: 1, draw: (p) => {
            for (let i = 0; i < 8; i++) {
                p.save();
                p.rotate(i * Math.PI / 4);
                p.beginPath();
                p.ellipse(0, -0.27, 0.11, 0.2, 0, 0, Math.PI * 2);
                outlined(p, cream, plum);
                p.restore();
            }
            p.beginPath();
            p.arc(0, 0, 0.13, 0, Math.PI * 2);
            outlined(p, amber, plum);
        } },
    { pack: "flowers", name: "tulip", label: "Tulip", aspect: 1.4, draw: (p) => {
            p.beginPath();
            p.moveTo(0, 0.05);
            p.quadraticCurveTo(0.04, 0.4, 0, 0.66);
            p.lineWidth = 0.05;
            p.strokeStyle = plum;
            p.lineCap = "round";
            p.stroke();
            p.beginPath();
            p.moveTo(0, 0.4);
            p.quadraticCurveTo(0.26, 0.26, 0.3, 0.42);
            p.quadraticCurveTo(0.16, 0.5, 0, 0.46);
            outlined(p, plum, cream);
            p.beginPath();
            p.moveTo(-0.26, -0.5);
            p.lineTo(-0.1, -0.34);
            p.lineTo(0, -0.56);
            p.lineTo(0.1, -0.34);
            p.lineTo(0.26, -0.5);
            p.quadraticCurveTo(0.3, 0.06, 0, 0.08);
            p.quadraticCurveTo(-0.3, 0.06, -0.26, -0.5);
            p.closePath();
            outlined(p, wine);
        } },
    { pack: "cafe", name: "coffee-cup", label: "Coffee cup", aspect: 1, draw: (p) => {
            p.lineCap = "round";
            for (const x of [-0.1, 0.06]) {
                p.beginPath();
                p.moveTo(x, -0.18);
                p.bezierCurveTo(x - 0.08, -0.28, x + 0.08, -0.34, x, -0.46);
                p.lineWidth = 0.04;
                p.strokeStyle = plum;
                p.stroke();
            }
            p.beginPath();
            p.arc(0.27, 0.06, 0.1, -Math.PI / 2, Math.PI / 2);
            p.lineWidth = 0.06;
            p.strokeStyle = plum;
            p.stroke();
            p.beginPath();
            p.moveTo(-0.32, -0.1);
            p.lineTo(0.3, -0.1);
            p.quadraticCurveTo(0.28, 0.3, 0, 0.3);
            p.quadraticCurveTo(-0.3, 0.3, -0.32, -0.1);
            p.closePath();
            outlined(p, cream, plum);
            p.beginPath();
            p.ellipse(0, 0.36, 0.44, 0.07, 0, 0, Math.PI * 2);
            outlined(p, blush, plum);
        } },
    { pack: "cafe", name: "macaron", label: "Macaron", aspect: 0.8, draw: (p) => {
            roundedRect(p, -0.42, -0.34, 0.84, 0.3, 0.15);
            outlined(p, blush, plum);
            roundedRect(p, -0.38, -0.06, 0.76, 0.12, 0.05);
            outlined(p, cream, plum);
            roundedRect(p, -0.42, 0.04, 0.84, 0.3, 0.15);
            outlined(p, blush, plum);
        } },
    { pack: "beauty", name: "lipstick", label: "Lipstick", aspect: 1.6, draw: (p) => {
            roundedRect(p, -0.2, 0.05, 0.4, 0.7, 0.05);
            outlined(p, plum, cream);
            roundedRect(p, -0.15, -0.2, 0.3, 0.28, 0.03);
            outlined(p, amber, plum);
            p.beginPath();
            p.moveTo(-0.1, -0.2);
            p.lineTo(-0.1, -0.56);
            p.lineTo(0.1, -0.7);
            p.lineTo(0.1, -0.2);
            p.closePath();
            outlined(p, wine, cream);
        } },
    { pack: "beauty", name: "hand-mirror", label: "Hand mirror", aspect: 1.5, draw: (p) => {
            roundedRect(p, -0.07, 0.1, 0.14, 0.62, 0.06);
            outlined(p, plum, cream);
            p.beginPath();
            p.ellipse(0, -0.25, 0.38, 0.44, 0, 0, Math.PI * 2);
            outlined(p, plum, cream);
            p.beginPath();
            p.ellipse(0, -0.25, 0.29, 0.35, 0, 0, Math.PI * 2);
            p.fillStyle = blush;
            p.fill();
            p.beginPath();
            p.moveTo(-0.14, -0.42);
            p.quadraticCurveTo(-0.2, -0.3, -0.16, -0.16);
            p.lineWidth = 0.04;
            p.strokeStyle = cream;
            p.lineCap = "round";
            p.stroke();
        } },
    { pack: "bubbles", name: "speech-bubble", label: "Speech bubble", aspect: 0.8, draw: (p) => {
            p.beginPath();
            p.ellipse(0, -0.06, 0.48, 0.3, 0, 0, Math.PI * 2);
            outlined(p, cream, plum);
            p.beginPath();
            p.moveTo(-0.18, 0.18);
            p.lineTo(-0.3, 0.38);
            p.lineTo(0.0, 0.22);
            p.fillStyle = cream;
            p.fill();
            p.lineWidth = OUT;
            p.strokeStyle = plum;
            p.stroke();
        } },
    { pack: "bubbles", name: "thought-cloud", label: "Thought cloud", aspect: 0.8, draw: (p) => {
            for (const [x, y, r] of [[-0.24, 0, 0.2], [0, -0.12, 0.24], [0.24, 0, 0.2], [0, 0.08, 0.22]]) {
                p.beginPath();
                p.arc(x, y, r, 0, Math.PI * 2);
                outlined(p, cream, plum);
            }
            for (const [x, y, r] of [[-0.18, 0.28, 0.06], [-0.3, 0.36, 0.035]]) {
                p.beginPath();
                p.arc(x, y, r, 0, Math.PI * 2);
                outlined(p, cream, plum);
            }
        } },
    { pack: "bubbles", name: "ribbon-banner", label: "Ribbon banner", aspect: 0.36, draw: (p) => {
            for (const s of [-1, 1]) {
                p.beginPath();
                p.moveTo(s * 0.34, -0.06);
                p.lineTo(s * 0.5, -0.06);
                p.lineTo(s * 0.44, 0.03);
                p.lineTo(s * 0.5, 0.13);
                p.lineTo(s * 0.34, 0.13);
                p.closePath();
                outlined(p, plumDeep, cream);
            }
            roundedRect(p, -0.38, -0.12, 0.76, 0.2, 0.02);
            outlined(p, wine, cream);
        } },
    { pack: "bubbles", name: "burst", label: "Burst badge", aspect: 1, draw: (p) => { starPath(p, 14, 0.48, 0.38); outlined(p, amber, plum); p.beginPath(); p.arc(0, 0, 0.3, 0, Math.PI * 2); p.lineWidth = 0.025; p.strokeStyle = cream; p.stroke(); } },
];
export function drawnSticker(pack, name) {
    return DRAWN.find((d) => d.pack === pack && d.name === name) ?? null;
}
/** Everything the library offers, pack by pack: the pictures in this build first, then the drawn
 * stickers of that pack whose name has no picture yet. */
export function library(files = STICKER_FILES) {
    const art = files.map(packFile).filter((f) => f !== null);
    return PACK_IDS.map((pack) => {
        const pics = art.filter((f) => f.pack === pack).sort((a, b) => a.name.localeCompare(b.name));
        const names = new Set(pics.map((f) => f.name));
        const items = pics.map((f) => ({ source: { kind: "pack", pack, name: f.name }, label: humanName(f.name), url: packUrl(pack, f.name) }));
        for (const d of DRAWN)
            if (d.pack === pack && !names.has(d.name))
                items.push({ source: { kind: "drawn", pack, name: d.name }, label: d.label });
        return { pack, label: PACKS[pack], items };
    });
}
export function humanName(name) {
    const s = name.replace(/-/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}
/** The ink colour of the white outline drawn round her own cut-out comes from save/sticker.ts;
 * this is the colour a missing picture shows as, so a gap is visible rather than silent. */
export const MISSING_FILL = ink;
//# sourceMappingURL=stickers.js.map