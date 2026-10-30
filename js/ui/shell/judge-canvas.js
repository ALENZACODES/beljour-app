/** Original, synthetic illustration and clearly labelled decorative edits. */
import { OUTPUT_SIZES, SIMULATION_MARK, } from "../../layout/judge-contract.js";
import { paintSubjectOverlays } from "./subject-render.js";
import { paintSingleExtraEdits } from "./judge-five-render.js";
import { PALETTE, token } from "../palette.js";
export const DRAW_WIDTH = 512;
export const DRAW_HEIGHT = 640;
function context(canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx)
        throw new Error("Canvas preview is unavailable on this device.");
    return ctx;
}
export function drawSyntheticPortrait(canvas) {
    canvas.width = DRAW_WIDTH;
    canvas.height = DRAW_HEIGHT;
    const ctx = context(canvas);
    ctx.fillStyle = PALETTE.panel; // backdrop: interface palette; the drawn person keeps her colours
    ctx.fillRect(0, 0, DRAW_WIDTH, DRAW_HEIGHT);
    ctx.fillStyle = PALETTE.blush;
    ctx.fillRect(18, 18, 476, 604);
    ctx.fillStyle = PALETTE.plum;
    ctx.fillRect(18, 18, 476, 6);
    ctx.fillStyle = "#344466";
    ctx.beginPath();
    ctx.ellipse(256, 657, 225, 230, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9A6C54";
    ctx.fillRect(224, 408, 64, 86);
    ctx.fillStyle = "#302B36";
    ctx.beginPath();
    ctx.ellipse(256, 285, 144, 200, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#C79278";
    ctx.beginPath();
    ctx.ellipse(256, 320, 112, 151, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#302B36";
    ctx.beginPath();
    ctx.ellipse(256, 198, 124, 92, -0.12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(149, 217, 22, 148);
    ctx.fillRect(345, 217, 19, 148);
    ctx.fillStyle = "#36271E";
    ctx.beginPath();
    ctx.ellipse(212, 318, 9, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(300, 318, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#573D35";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(201, 297);
    ctx.lineTo(224, 297);
    ctx.moveTo(289, 297);
    ctx.lineTo(312, 297);
    ctx.stroke();
    ctx.strokeStyle = "#8B5B4D";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(253, 332);
    ctx.lineTo(249, 364);
    ctx.lineTo(267, 366);
    ctx.stroke();
    ctx.strokeStyle = "#8A474B";
    ctx.beginPath();
    ctx.moveTo(223, 402);
    ctx.quadraticCurveTo(256, 422, 289, 402);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.font = "600 17px system-ui";
    ctx.fillText("DRAWN SAMPLE · NO REAL PERSON", 35, 591);
}
function hairOverlay(ctx, shade, gain) {
    if (shade === "none")
        return;
    ctx.save();
    ctx.globalAlpha = 0.75 * gain;
    ctx.fillStyle = shade === "chestnut" ? "#70412B" : "#263A73";
    ctx.beginPath();
    ctx.ellipse(256, 198, 124, 92, -0.12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(149, 220, 22, 137);
    ctx.fillRect(345, 220, 19, 137);
    ctx.restore();
}
function faceOverlay(ctx, tone, gain) {
    if (tone === "none")
        return;
    ctx.save();
    ctx.fillStyle = tone === "warm" ? "#C26F69" : "#A37BB2";
    ctx.globalAlpha = 0.34 * gain;
    ctx.beginPath();
    ctx.ellipse(192, 372, 27, 13, 0.2, 0, Math.PI * 2);
    ctx.ellipse(320, 372, 27, 13, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
function mockOverlay(ctx, gain) {
    ctx.save();
    ctx.globalAlpha = 0.72 * gain;
    ctx.strokeStyle = "#354789";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(205, 319, 32, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(306, 319, 32, 22, 0, 0, Math.PI * 2);
    ctx.moveTo(237, 318);
    ctx.lineTo(274, 318);
    ctx.stroke();
    ctx.restore();
}
/** Fixed-position overlays are illustrative, not face tracked or provider output. */
export function paintJudgeLook(source, target, state, size = "standard", label = true, subject = null, allowUntracked = true) {
    if (!state.source)
        throw new Error("Choose an image before rendering.");
    const dimensions = OUTPUT_SIZES[size];
    target.width = dimensions.width;
    target.height = dimensions.height;
    const ctx = context(target);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);
    const scaleX = target.width / DRAW_WIDTH;
    const scaleY = target.height / DRAW_HEIGHT;
    if (subject) {
        paintSubjectOverlays(ctx, subject, state, target.width, target.height);
    }
    else if (allowUntracked) {
        ctx.save();
        ctx.scale(scaleX, scaleY);
        const gain = (state.strength ?? 5.0) / 5.0;
        hairOverlay(ctx, state.hair, gain);
        faceOverlay(ctx, state.face, gain);
        paintSingleExtraEdits(ctx, state, gain);
        if (state.mock)
            mockOverlay(ctx, gain);
        ctx.restore();
    }
    if (label)
        burnJudgeLabel(ctx, target.width, target.height);
}
/** Every exported raster receives the mark *after* compositing, not as a CSS badge. */
export function burnJudgeLabel(ctx, width, height) {
    const textSize = Math.max(14, Math.round(width / 29));
    const margin = Math.max(9, Math.round(width / 45));
    const banner = textSize * 2.45;
    ctx.save();
    ctx.fillStyle = PALETTE.plum; // burned into exports: fixed light palette, never the page theme
    ctx.fillRect(0, height - banner, width, banner);
    ctx.font = `700 ${textSize}px system-ui`;
    ctx.fillStyle = PALETTE.cream;
    ctx.textBaseline = "middle";
    ctx.fillText(SIMULATION_MARK, margin, height - banner / 2, width - margin * 2);
    ctx.restore();
}
export function drawJudgeComparison(original, edited, target, percent) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new RangeError("Comparison must be between 0 and 100");
    }
    target.width = DRAW_WIDTH;
    target.height = DRAW_HEIGHT;
    const ctx = context(target);
    ctx.drawImage(edited, 0, 0, DRAW_WIDTH, DRAW_HEIGHT);
    const split = Math.round(DRAW_WIDTH * percent / 100);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, split, DRAW_HEIGHT);
    ctx.clip();
    ctx.drawImage(original, 0, 0, DRAW_WIDTH, DRAW_HEIGHT);
    ctx.restore();
    ctx.fillStyle = token("plum");
    ctx.fillRect(Math.max(0, split - 2), 0, 4, DRAW_HEIGHT);
}
//# sourceMappingURL=judge-canvas.js.map