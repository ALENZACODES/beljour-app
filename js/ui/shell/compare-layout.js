/** Responsive compare layout: where each pane and caption goes in the stage box.
 *
 * The plan's done-when for R9 is "compare modes work at 390 px and 1280 px". This module
 * decides, for a stage box measured by the page (or the stageBox model in tests), how many
 * columns a mode uses, how big each pane is and how its caption wraps. Captions are wrapped
 * with a real text measure (canvas measureText in the browser, an average-glyph estimate in
 * Node), and a caption band grows to fit, so captions are never clipped (plan M67).
 *
 * Author: John Khan.
 */
import { MODE_INFO } from "./compare.js";
/** Average-glyph width estimate for system-ui; deliberately generous so real text fits. */
export const estimateWidth = (text, fontPx) => {
    let units = 0;
    for (const ch of text) {
        if (/[ilI.,:;'|!]/.test(ch))
            units += 0.3;
        else if (/[mwMW@×]/.test(ch))
            units += 0.9;
        else if (/[A-Z0-9%]/.test(ch))
            units += 0.68;
        else if (ch === " ")
            units += 0.3;
        else
            units += 0.56;
    }
    return units * fontPx;
};
/** The CSS breakpoint at which studio.html switches to the phone layout (shell.css). */
export const PHONE_MAX = 660;
/** Smallest pane side we accept before changing the arrangement (a thumb-sized target). */
export const MIN_PANE = 96;
export const MAX_UPSCALE = 4;
/** A model of shell.css: the stage box the compare canvas gets at a window size.
 * Desktop: 232 px tools column + 322 px inspector, workspace padding 40 px a side,
 * canvas frame borders and the scroll area's 12 px side padding. Between 970 and 1270 px the
 * columns narrow; at 660 px and below everything stacks with 11 px page gutters. */
export function stageBox(viewportWidth, viewportHeight) {
    if (!(Number.isFinite(viewportWidth) && Number.isFinite(viewportHeight) && viewportWidth >= 280 && viewportHeight >= 320)) {
        throw new RangeError("Viewport must be at least 280 × 320");
    }
    if (viewportWidth <= PHONE_MAX) {
        const width = viewportWidth - 2 * 11 - 2 - 2 * 6;
        return { phone: true, box: { width: Math.floor(width), height: Math.floor(Math.max(260, viewportHeight * 0.62)) } };
    }
    let sides, padding;
    if (viewportWidth <= 970) {
        sides = 200;
        padding = 18;
    }
    else if (viewportWidth <= 1270) {
        sides = 196 + 280;
        padding = 18;
    }
    else {
        sides = 232 + 322;
        padding = Math.min(40, viewportWidth * 0.025);
    }
    const width = viewportWidth - sides - 2 * padding - 2 - 2 * 12;
    return { phone: false, box: { width: Math.floor(width), height: Math.floor(Math.min(720, viewportHeight * 0.68) - 60) } };
}
export const DESKTOP_CAPTION = { fontPx: 12, lineHeight: 16, padding: 6 };
export const PHONE_CAPTION = { fontPx: 11, lineHeight: 15, padding: 5 };
/** Greedy word wrap; a word wider than the line is broken by characters, never cut off. */
export function wrapText(text, maxWidth, fontPx, measure = estimateWidth) {
    if (!(Number.isFinite(maxWidth) && maxWidth >= fontPx))
        throw new RangeError("Caption width is too small for its font");
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    const pushWord = (word) => {
        if (measure(word, fontPx) <= maxWidth)
            return [word];
        const parts = [];
        let part = "";
        for (const ch of word) {
            if (part && measure(part + ch, fontPx) > maxWidth) {
                parts.push(part);
                part = ch;
            }
            else
                part += ch;
        }
        if (part)
            parts.push(part);
        return parts;
    };
    for (const word of words) {
        for (const piece of pushWord(word)) {
            const candidate = line ? `${line} ${piece}` : piece;
            if (line && measure(candidate, fontPx) > maxWidth) {
                lines.push(line);
                line = piece;
            }
            else
                line = candidate;
        }
    }
    if (line)
        lines.push(line);
    return lines.length ? lines : [""];
}
function single(input) {
    const { image, box } = input;
    const scale = Math.min(MAX_UPSCALE, box.width / image.width, box.height / image.height);
    return { mode: input.mode, width: image.width, height: image.height, displayScale: Math.max(0.05, scale),
        columns: 1, rows: 1, gap: 0, stacked: false, phone: input.phone,
        panes: [{ frame: 0, x: 0, y: 0, w: image.width, h: image.height, caption: [], captionY: image.height, captionH: 0 }] };
}
function loupe(input) {
    const { box } = input, gap = input.phone ? 6 : 10;
    const across = Math.floor(Math.min((box.width - gap) / 2, box.height, 360));
    const stacked = across < 150;
    const pane = stacked ? Math.floor(Math.min(box.width, 360, Math.max(MIN_PANE, (box.height - gap) / 2))) : Math.max(MIN_PANE, across);
    const width = stacked ? pane : pane * 2 + gap, height = stacked ? pane * 2 + gap : pane;
    return { mode: input.mode, width, height, displayScale: Math.min(1, box.width / width), columns: stacked ? 1 : 2, rows: stacked ? 2 : 1,
        gap, stacked, phone: input.phone, loupePane: pane,
        panes: [
            { frame: 0, x: 0, y: 0, w: pane, h: pane, caption: [], captionY: pane, captionH: 0 },
            { frame: 1, x: stacked ? 0 : pane + gap, y: stacked ? pane + gap : 0, w: pane, h: pane, caption: [], captionY: 0, captionH: 0 },
        ].map((p) => ({ ...p, captionY: p.y + p.h })) };
}
/** Pick columns for a grid: the arrangement that shows each photo largest within the stage.
 * Near-ties (within 15%) go to more columns, so before and after sit next to each other when
 * that costs little. On a phone the page may scroll, but the stage height still guides the choice. */
export function chooseColumns(count, image, box, gap, captionH, options) {
    const scored = [];
    for (const columns of options) {
        const rows = Math.ceil(count / columns);
        const paneW = (box.width - gap * (columns - 1)) / columns;
        if (paneW < MIN_PANE)
            continue;
        const paneH = Math.max(1, (box.height - gap * (rows - 1)) / rows - captionH);
        const scale = Math.min(paneW / image.width, paneH / image.height, MAX_UPSCALE);
        scored.push({ columns, area: scale * scale * image.width * image.height });
    }
    if (!scored.length)
        return Math.min(...options);
    const best = Math.max(...scored.map((s) => s.area));
    return Math.max(...scored.filter((s) => s.area >= best * 0.85).map((s) => s.columns));
}
function grid(input, count, options) {
    const { image, box, phone } = input, measure = input.measure ?? estimateWidth;
    const style = phone ? PHONE_CAPTION : DESKTOP_CAPTION, gap = phone ? 6 : 12;
    const roughCaption = style.lineHeight * 2 + style.padding * 2;
    const columns = chooseColumns(count, image, box, gap, roughCaption, options);
    const rows = Math.ceil(count / columns);
    const paneW = Math.floor((box.width - gap * (columns - 1)) / columns);
    const wrapped = Array.from({ length: count }, (_, i) => wrapText(input.captions[i] ?? "", paneW - style.padding * 2, style.fontPx, measure));
    const rowCaption = Array.from({ length: rows }, (_, r) => Math.max(...wrapped.slice(r * columns, r * columns + columns).map((lines) => lines.length)) * style.lineHeight + style.padding * 2);
    const spareH = phone ? Infinity : (box.height - gap * (rows - 1) - rowCaption.reduce((a, b) => a + b, 0)) / rows;
    const scale = Math.min(paneW / image.width, spareH / image.height, MAX_UPSCALE);
    const paneH = Math.max(1, Math.floor(image.height * scale));
    const panes = [];
    let y = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
            const i = r * columns + c;
            if (i >= count)
                break;
            panes.push({ frame: i, x: c * (paneW + gap), y, w: paneW, h: paneH, caption: wrapped[i], captionY: y + paneH, captionH: rowCaption[r] });
        }
        y += paneH + rowCaption[r] + gap;
    }
    const width = columns * paneW + gap * (columns - 1), height = y - gap;
    return { mode: input.mode, width, height, displayScale: 1, columns, rows, gap, stacked: columns === 1, phone, panes };
}
/** Lay out a compare mode inside the stage box. */
export function layoutCompare(input) {
    const { image, box } = input;
    if (!(image.width >= 1 && image.height >= 1 && box.width >= MIN_PANE && box.height >= 64))
        throw new RangeError("Stage or photo is too small to compare");
    const info = MODE_INFO[input.mode];
    if (input.mode === "loupe")
        return loupe(input);
    if (info.inputs === "pair" && input.mode !== "side-by-side")
        return single(input);
    if (input.mode === "side-by-side")
        return grid(input, 2, [2, 1]);
    if (input.mode === "grid-2x2")
        return grid(input, 4, input.phone ? [2, 1] : [2, 4, 1]);
    return grid(input, 9, input.phone ? [3, 2, 1] : [3]);
}
/** Map a pointer on the displayed canvas to image coordinates of the pane under it. */
export function paneAt(layout, cssX, cssY) {
    const x = cssX / layout.displayScale, y = cssY / layout.displayScale;
    for (const pane of layout.panes) {
        if (x >= pane.x && x < pane.x + pane.w && y >= pane.y && y < pane.y + pane.h)
            return { pane, x: x - pane.x, y: y - pane.y };
    }
    return null;
}
/** Problems that would make a layout unusable: panes off the board, overlaps, clipped captions. */
export function layoutProblems(layout, box, measure = estimateWidth) {
    const problems = [];
    const style = layout.phone ? PHONE_CAPTION : DESKTOP_CAPTION;
    if (layout.width * layout.displayScale > box.width + 0.5)
        problems.push(`board is ${Math.round(layout.width * layout.displayScale)} px wide in a ${box.width} px stage`);
    layout.panes.forEach((p, i) => {
        if (p.x < 0 || p.y < 0 || p.x + p.w > layout.width || p.y + p.h > layout.height)
            problems.push(`pane ${i} lies outside the board`);
        if (p.captionY + p.captionH > layout.height + 0.5)
            problems.push(`caption ${i} runs below the board`);
        for (const line of p.caption) {
            if (measure(line, style.fontPx) > p.w - style.padding * 2 + 0.5)
                problems.push(`caption ${i} is wider than its pane: ${line}`);
        }
        if (p.caption.length * style.lineHeight + (p.caption.length ? style.padding * 2 : 0) > p.captionH + 0.5)
            problems.push(`caption ${i} is taller than its band`);
        for (let j = i + 1; j < layout.panes.length; j++) {
            const q = layout.panes[j];
            const overlapX = p.x < q.x + q.w && q.x < p.x + p.w;
            const overlapY = p.y < q.y + q.h + q.captionH && q.y < p.y + p.h + p.captionH;
            if (overlapX && overlapY)
                problems.push(`panes ${i} and ${j} overlap`);
        }
        if (MODE_INFO[layout.mode].inputs !== "pair" || layout.mode === "side-by-side") {
            if (Math.min(p.w, p.h) < Math.min(MIN_PANE, 48))
                problems.push(`pane ${i} is too small to read`);
        }
    });
    return problems;
}
