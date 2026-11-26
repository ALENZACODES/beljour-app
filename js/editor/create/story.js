/** Story templates (9:16): eight layouts of our own, each a background, photo slots, a few drawn
 * shapes and starting text. Applying one makes a story board and places its words as ordinary
 * text layers, so every word can be edited, moved, restyled or deleted afterwards. Named for
 * French places like the filter looks.
 * The slots are given for a 1000 x 1778 page (9:16) and scale with the page.
 * Author: John Khan.
 */
import { emptyCell } from "./board.js";
import { identity } from "./geometry.js";
import { PALETTE } from "../../ui/palette.js";
export const STORY_W = 1000, STORY_H = 1000 * 16 / 9;
const H = STORY_H;
const { plum, plumDeep, blush, cream, ink, muted, surface } = PALETTE;
const slot = (x, y, width, height, extra = {}) => ({ x, y, width, height, rotation: 0, shape: "rect", border: 0, radius: 0, asset: "edited", ...extra });
const words = (text, x, y, extra = {}) => ({ text, font: "fraunces", size: 90, style: "rivoli", align: "center", colour: cream, accent: plum, x, y, boxWidth: 860, ...extra });
export const STORIES = [
    { id: "trocadero", label: "Trocadéro", does: "A full photo with a title band across it", background: [ink, ink],
        slots: [slot(0, 0, 1000, H)], decor: [{ kind: "rect", x: 0, y: H * 0.64, width: 1000, height: 270, colour: plum, alpha: 0.86 }],
        texts: [words("Six weeks in", 500, H * 0.64 + 105, { size: 104 }), words("A line about the day", 500, H * 0.64 + 205, { font: "sans", size: 40, colour: blush })] },
    { id: "pont-neuf", label: "Pont Neuf", does: "Before and after, one above the other", background: [cream, cream],
        slots: [slot(0, 0, 1000, H / 2 - 6, { asset: "original" }), slot(0, H / 2 + 6, 1000, H / 2 - 6)], decor: [],
        texts: [words("Before", 170, 90, { font: "sans", size: 46, style: "marais", colour: cream, accent: plum, boxWidth: 260 }),
            words("After", 170, H / 2 + 96, { font: "sans", size: 46, style: "marais", colour: cream, accent: plum, boxWidth: 260 })] },
    { id: "saint-germain", label: "Saint-Germain", does: "Three moments in a strip", background: [cream, cream],
        slots: [0, 1, 2].map((i) => slot(60, 170 + i * 535, 880, 495, { radius: 26 })), decor: [],
        texts: [words("Three moments", 500, 92, { size: 72, colour: plum }),
            ...["Morning", "Afternoon", "Evening"].map((t, i) => words(t, 210, 170 + i * 535 + 440, { font: "sans", size: 36, style: "marais", accent: plum, boxWidth: 260 }))] },
    { id: "rive-gauche", label: "Rive Gauche", does: "A quote card with a round photo", background: [plum, plumDeep],
        slots: [slot(270, 190, 460, 460, { shape: "circle", border: 14 })], decor: [{ kind: "rule", x: 420, y: 1290, width: 160, height: 4, colour: blush, alpha: 1 }],
        texts: [words("“Soft light, slow mornings, strong coffee.”", 500, 980, { size: 84, boxWidth: 820 }), words("Written by you", 500, 1370, { font: "sans", size: 38, colour: blush })] },
    { id: "etretat", label: "Étretat", does: "Two tilted prints with a caption", background: [blush, blush],
        slots: [slot(110, 260, 620, 720, { rotation: -0.08, border: 26 }), slot(280, 860, 620, 720, { rotation: 0.07, border: 26, asset: "original" })], decor: [],
        texts: [words("Weekend notes", 500, 1680, { size: 76, colour: plum })] },
    { id: "montparnasse", label: "Montparnasse", does: "A full photo with words at the top and bottom", background: [ink, ink],
        slots: [slot(0, 0, 1000, H)],
        decor: [{ kind: "scrim-top", x: 0, y: 0, width: 1000, height: 420, colour: ink, alpha: 0.7 }, { kind: "scrim-bottom", x: 0, y: H - 420, width: 1000, height: 420, colour: ink, alpha: 0.7 }],
        texts: [words("Tonight", 500, 170, { size: 128, style: "odeon", accent: ink }), words("Little things, all day long", 500, H - 150, { font: "sans", size: 44 })] },
    { id: "belleville", label: "Belleville", does: "Four photos with a title band in the middle", background: [cream, cream],
        slots: [slot(36, 36, 452, 790, { radius: 18 }), slot(512, 36, 452, 790, { radius: 18, asset: "original" }),
            slot(36, H - 826, 452, 790, { radius: 18, asset: "original" }), slot(512, H - 826, 452, 790, { radius: 18 })],
        decor: [{ kind: "rect", x: 0, y: H / 2 - 62, width: 1000, height: 124, colour: surface, alpha: 1 }],
        texts: [words("The week in photos", 500, H / 2, { size: 70, colour: plum })] },
    { id: "honfleur", label: "Honfleur", does: "An arched window photo with a title under it", background: [cream, blush],
        slots: [slot(140, 210, 720, 980, { shape: "arch", border: 0 })], decor: [{ kind: "rule", x: 440, y: 1430, width: 120, height: 4, colour: plum, alpha: 1 }],
        texts: [words("Golden hour", 500, 1330, { size: 104, colour: plum }), words("Notes from today", 500, 1510, { font: "sans", size: 40, colour: muted })] },
];
export function story(id) {
    const found = STORIES.find((s) => s.id === id);
    if (!found)
        throw new RangeError("That story template isn't in this version");
    return found;
}
/** A template's slots in page units for a board drawn `width` x `height` units. */
export function storyCells(templateId, width, height) {
    const t = story(templateId), kx = width / STORY_W, ky = height / STORY_H, k = Math.min(kx, ky);
    return t.slots.map((s) => ({ ...s, x: s.x * kx, y: s.y * ky, width: s.width * kx, height: s.height * ky, border: s.border * k, radius: s.radius * k }));
}
/** The board a template makes, with `edited` and `original` placed where it says. */
export function storyBoard(templateId) {
    const t = story(templateId);
    return { kind: "story", layout: t.id, aspect: "9:16", spacing: 0, radius: 0, background: t.background[0], cells: t.slots.map((s) => emptyCell(s.asset)) };
}
/** The template's words as text layers, ids from `firstId` on, marked with the template. */
export function storyTexts(templateId, firstId) {
    const t = story(templateId);
    return t.texts.map((w, i) => ({ type: "text", id: `c${firstId + i}`, hidden: false, opacity: 1, template: t.id,
        text: w.text, font: w.font, size: w.size, style: w.style, align: w.align, colour: w.colour, accent: w.accent, boxWidth: w.boxWidth,
        transform: identity(w.x, w.y) }));
}
//# sourceMappingURL=story.js.map