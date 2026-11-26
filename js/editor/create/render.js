import { PAGE_UNITS } from "./geometry.js";
import { fontCss, layoutText, stylePad } from "./text.js";
import { BRUSHES, tracePath } from "./ink.js";
import { drawnSticker } from "./stickers.js";
import { frameLayout } from "./frames.js";
import { boardPixels, coverCrop } from "./board.js";
import { collageCells } from "./collage.js";
import { story, storyCells } from "./story.js";
import { shapePath, roundedRect } from "./shapes.js";
import { PALETTE, withAlpha } from "../../ui/palette.js";
/** Where everything goes on the page. `base` is the photo's size (used when there is no board). */
export function pageGeometry(doc, base) {
    const fixed = !!doc.board;
    const inner = doc.board ? boardPixels(doc.board.aspect) : base;
    const frame = frameLayout(inner.width, inner.height, doc.frame, fixed);
    const pxPerUnit = frame.width / PAGE_UNITS;
    const units = { width: PAGE_UNITS, height: frame.height / pxPerUnit };
    let cells = [];
    if (doc.board) {
        const p = frame.picture, k = p.width / PAGE_UNITS; // board pixels per board unit
        const bw = PAGE_UNITS, bh = p.height / k;
        const raw = doc.board.kind === "story" ? storyCells(doc.board.layout, bw, bh)
            : collageCells(doc.board, bw, bh).map((c) => ({ ...c, radius: doc.board.radius }));
        cells = raw.map((c) => ({ ...c, x: (p.x + c.x * k) / pxPerUnit, y: (p.y + c.y * k) / pxPerUnit,
            width: c.width * k / pxPerUnit, height: c.height * k / pxPerUnit, border: c.border * k / pxPerUnit, radius: c.radius * k / pxPerUnit }));
    }
    return { pixels: { width: frame.width, height: frame.height }, units, frame, pxPerUnit, cells };
}
function canvasMeasure(ctx) {
    return (text, font, size) => { ctx.font = fontCss(font, size); return ctx.measureText(text).width; };
}
export function textLayout(l, measure) {
    return layoutText(l.text, { font: l.font, size: l.size, boxWidth: l.boxWidth, align: l.align }, measure);
}
/** The box a layer occupies in its own units (for hit tests and the selection outline).
 * Ink layers are not boxes: they return null. */
export function layerSize(l, assets, measure) {
    if (l.type === "text") {
        const t = textLayout(l, measure), pad = stylePad(l.style) * l.size;
        const wide = Math.max(...t.lines.map((x) => x.width), 1);
        return { width: Math.max(wide, l.boxWidth) + 2 * pad, height: t.height + 2 * pad };
    }
    if (l.type === "sticker")
        return { width: l.width, height: l.width * stickerAspect(l.source, assets) };
    return null;
}
export function stickerAspect(source, assets) {
    if (source.kind === "drawn")
        return drawnSticker(source.pack, source.name)?.aspect ?? 1;
    const pic = assets.sticker(source);
    return pic ? pic.height / pic.width : 1;
}
function drawText(ctx, l, measure, devicePerUnit) {
    const t = textLayout(l, measure), s = l.size;
    ctx.font = fontCss(l.font, s);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (l.style === "marais") {
        ctx.fillStyle = l.accent;
        const pad = s * 0.3;
        for (const line of t.lines)
            if (line.text) {
                roundedRect(ctx, line.x - pad, line.y - t.lineHeight * 0.48, line.width + pad * 2, t.lineHeight * 0.96, s * 0.22);
                ctx.fill();
            }
    }
    if (l.style === "montmartre") {
        ctx.lineJoin = "round";
        ctx.lineWidth = s * 0.16;
        ctx.strokeStyle = l.accent;
        for (const line of t.lines)
            ctx.strokeText(line.text, line.x, line.y);
    }
    const fill = (colour, blur, dy = 0) => {
        ctx.save();
        ctx.shadowColor = blur > 0 ? (l.style === "odeon" ? withAlpha(l.accent, 0.6) : l.accent) : "transparent";
        ctx.shadowBlur = blur * devicePerUnit;
        ctx.shadowOffsetY = dy * devicePerUnit;
        ctx.shadowOffsetX = 0;
        ctx.fillStyle = colour;
        for (const line of t.lines)
            ctx.fillText(line.text, line.x, line.y);
        ctx.restore();
    };
    if (l.style === "odeon")
        fill(l.colour, s * 0.18, s * 0.07);
    else if (l.style === "pigalle") {
        fill(l.accent, s * 0.6);
        fill(l.colour, s * 0.25);
        fill(l.colour, s * 0.08);
    }
    else
        fill(l.colour, 0);
}
function drawSticker(ctx, source, width, assets) {
    if (source.kind === "drawn") {
        const d = drawnSticker(source.pack, source.name);
        if (!d)
            return;
        ctx.save();
        ctx.scale(width, width);
        d.draw(ctx);
        ctx.restore();
        return;
    }
    const pic = assets.sticker(source);
    if (!pic)
        return; // not loaded: the panel waits for pictures before saving
    const h = width * pic.height / pic.width;
    ctx.drawImage(pic.source, -width / 2, -h / 2, width, h);
}
function drawStroke(ctx, s, devicePerUnit) {
    const b = BRUSHES[s.brush];
    ctx.save();
    ctx.globalCompositeOperation = s.brush === "eraser" ? "destination-out" : "source-over";
    ctx.lineCap = b.cap;
    ctx.lineJoin = "round";
    ctx.lineWidth = s.width;
    ctx.strokeStyle = s.brush === "eraser" ? "#000000" : s.colour;
    ctx.globalAlpha = b.alpha;
    if (s.brush === "neon") {
        ctx.shadowColor = s.colour;
        ctx.shadowBlur = s.width * 1.6 * devicePerUnit;
    }
    ctx.beginPath();
    tracePath(ctx, s.points);
    ctx.stroke();
    if (s.brush === "neon") {
        ctx.shadowBlur = 0;
        ctx.lineWidth = s.width * 0.42;
        ctx.strokeStyle = withAlpha(PALETTE.cream, 0.9);
        ctx.beginPath();
        tracePath(ctx, s.points);
        ctx.stroke();
    }
    ctx.restore();
}
function drawCell(ctx, cell, pic, c, preview) {
    ctx.save();
    ctx.translate(cell.x + cell.width / 2, cell.y + cell.height / 2);
    if (cell.rotation)
        ctx.rotate(cell.rotation);
    const x = -cell.width / 2, y = -cell.height / 2;
    if (cell.border > 0) {
        ctx.save();
        ctx.shadowColor = withAlpha(PALETTE.ink, 0.25);
        ctx.shadowBlur = cell.border;
        ctx.shadowOffsetY = cell.border / 3;
        ctx.fillStyle = PALETTE.surface;
        shapePath(ctx, cell.shape, x - cell.border, y - cell.border, cell.width + cell.border * 2, cell.height + cell.border * 2, cell.radius + cell.border);
        ctx.fill();
        ctx.restore();
    }
    shapePath(ctx, cell.shape, x, y, cell.width, cell.height, cell.radius);
    ctx.clip();
    if (pic) {
        const crop = coverCrop(pic.width, pic.height, cell.width, cell.height, c?.zoom ?? 1, c?.panX ?? 0, c?.panY ?? 0);
        ctx.drawImage(pic.source, crop.sx, crop.sy, crop.sw, crop.sh, x, y, cell.width, cell.height);
    }
    else {
        ctx.fillStyle = PALETTE.panel;
        ctx.fillRect(x, y, cell.width, cell.height);
        if (preview) {
            // an empty cell says so in the preview; the saved file keeps the plain panel colour
            ctx.strokeStyle = PALETTE.muted;
            ctx.lineWidth = Math.max(1, Math.min(cell.width, cell.height) / 60);
            const r = Math.min(cell.width, cell.height) / 8;
            ctx.beginPath();
            ctx.moveTo(-r, 0);
            ctx.lineTo(r, 0);
            ctx.moveTo(0, -r);
            ctx.lineTo(0, r);
            ctx.stroke();
        }
    }
    ctx.restore();
}
function drawBoardBackground(ctx, board, r) {
    let fill = board.background;
    if (board.kind === "story") {
        const t = story(board.layout);
        if (board.background === t.background[0] && t.background[1] !== t.background[0]) {
            const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.height);
            g.addColorStop(0, t.background[0]);
            g.addColorStop(1, t.background[1]);
            fill = g;
        }
    }
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.width, r.height);
}
function drawDecor(ctx, board, r) {
    if (board.kind !== "story")
        return;
    const t = story(board.layout), k = r.width / PAGE_UNITS, ky = r.height / (PAGE_UNITS * 16 / 9);
    for (const d of t.decor) {
        const x = r.x + d.x * k, y = r.y + d.y * ky, w = d.width * k, h = d.height * ky;
        if (d.kind === "scrim-top" || d.kind === "scrim-bottom") {
            const g = ctx.createLinearGradient(0, y, 0, y + h);
            const a = withAlpha(d.colour, d.alpha), z = withAlpha(d.colour, 0);
            g.addColorStop(0, d.kind === "scrim-top" ? a : z);
            g.addColorStop(1, d.kind === "scrim-top" ? z : a);
            ctx.fillStyle = g;
        }
        else
            ctx.fillStyle = withAlpha(d.colour, d.alpha);
        ctx.fillRect(x, y, w, h);
    }
}
function drawFrameOver(ctx, doc, f) {
    if (!doc.frame)
        return;
    const p = f.picture;
    if (doc.frame.kind === "giverny") {
        const cx = p.x + p.width / 2, cy = p.y + p.height / 2, far = Math.hypot(p.width, p.height) / 2;
        const feather = Math.min(0.95, doc.frame.thickness / 1000 * 2.2);
        const g = ctx.createRadialGradient(cx, cy, far * (1 - feather), cx, cy, far);
        g.addColorStop(0, withAlpha(doc.frame.colour, 0));
        g.addColorStop(1, withAlpha(doc.frame.colour, 1));
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.restore();
    }
    if (f.holes.length) {
        ctx.save();
        ctx.fillStyle = withAlpha(PALETTE.cream, 0.92);
        for (const h of f.holes) {
            roundedRect(ctx, h.x, h.y, h.width, h.height, Math.min(h.width, h.height) / 4);
            ctx.fill();
        }
        ctx.restore();
    }
}
/** Draw the page onto env.ctx (which must already be scale x the page's pixel size). */
export function renderPage(env, doc, options) {
    const { ctx, assets } = env, scale = options.scale ?? 1;
    const base = options.base;
    if (!doc.board && !base)
        throw new RangeError("Open a photo first");
    const g = pageGeometry(doc, base ?? { width: 1, height: 1 });
    const f = g.frame, p = f.picture;
    ctx.save();
    ctx.scale(scale, scale);
    // 1. the frame colour, then the picture inside it
    if (doc.frame) {
        ctx.fillStyle = doc.frame.colour;
        ctx.fillRect(0, 0, f.width, f.height);
    }
    ctx.save();
    if (f.radius > 0) {
        roundedRect(ctx, p.x, p.y, p.width, p.height, f.radius);
        ctx.clip();
    }
    if (doc.board) {
        drawBoardBackground(ctx, doc.board, p);
        ctx.save();
        ctx.scale(g.pxPerUnit, g.pxPerUnit);
        g.cells.forEach((cell, i) => {
            const c = doc.board.cells[i];
            drawCell(ctx, cell, c?.asset ? assets.photo(c.asset) : null, c, !!options.preview);
        });
        ctx.restore();
        drawDecor(ctx, doc.board, p);
    }
    else if (base) {
        ctx.drawImage(base.source, p.x, p.y, p.width, p.height);
    }
    ctx.restore();
    drawFrameOver(ctx, doc, f);
    // 2. the layers, bottom first, in page units
    const measure = env.measure ?? canvasMeasure(ctx);
    const devicePerUnit = scale * g.pxPerUnit;
    ctx.save();
    ctx.scale(g.pxPerUnit, g.pxPerUnit);
    for (const l of doc.layers) {
        if (l.hidden || l.opacity <= 0)
            continue;
        if (l.type === "ink") {
            drawInk(env, l.strokes, l.opacity, g, scale);
            continue;
        }
        ctx.save();
        ctx.globalAlpha = l.opacity;
        const t = l.transform;
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rotation);
        ctx.scale(t.flip ? -t.scale : t.scale, t.scale);
        if (l.type === "text")
            drawText(ctx, l, measure, devicePerUnit * t.scale);
        else
            drawSticker(ctx, l.source, l.width, assets);
        ctx.restore();
    }
    ctx.restore();
    ctx.restore();
    return g;
}
function drawInk(env, strokes, opacity, g, scale) {
    if (!strokes.length)
        return;
    const w = Math.max(1, Math.round(g.pixels.width * scale)), h = Math.max(1, Math.round(g.pixels.height * scale));
    const sheet = env.sheet(w, h);
    const devicePerUnit = scale * g.pxPerUnit;
    if (!sheet) {
        // no second canvas: draw straight on the page (the eraser then has nothing of its own to erase)
        for (const s of strokes)
            if (s.brush !== "eraser")
                drawStroke(env.ctx, s, devicePerUnit);
        return;
    }
    sheet.ctx.save();
    sheet.ctx.scale(devicePerUnit, devicePerUnit);
    for (const s of strokes)
        drawStroke(sheet.ctx, s, devicePerUnit);
    sheet.ctx.restore();
    const ctx = env.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.drawImage(sheet.source, 0, 0);
    ctx.restore();
}
//# sourceMappingURL=render.js.map