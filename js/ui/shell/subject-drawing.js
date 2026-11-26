/** Original diagram of two adults. Neither figure represents an actual person. */
import { PALETTE } from "../palette.js";
export const PAIR_WIDTH = 512;
export const PAIR_HEIGHT = 640;
function portrait(ctx, position) {
    const { cx, cy, factor, skin, hair, coat } = position;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(factor, factor);
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, 238, 150, 118, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.fillRect(-30, 123, 60, 78);
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(0, 0, 102, 158, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, 15, 83, 114, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(0, -94, 88, 62, -0.05, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#1B1B35";
    ctx.beginPath();
    ctx.ellipse(-32, 11, 7, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(32, 11, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#724F48";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, 21);
    ctx.lineTo(-10, 49);
    ctx.lineTo(9, 52);
    ctx.moveTo(-26, 81);
    ctx.quadraticCurveTo(0, 95, 26, 81);
    ctx.stroke();
    ctx.restore();
}
export function drawTwoPersonSample(target) {
    target.width = PAIR_WIDTH;
    target.height = PAIR_HEIGHT;
    const ctx = target.getContext("2d", { alpha: false });
    if (!ctx)
        throw new Error("This browser cannot draw the local sample");
    ctx.fillStyle = PALETTE.panel; // backdrop and caption: interface palette; the drawn people keep theirs
    ctx.fillRect(0, 0, PAIR_WIDTH, PAIR_HEIGHT);
    ctx.fillStyle = PALETTE.blush;
    ctx.fillRect(16, 16, 480, 600);
    ctx.fillStyle = PALETTE.plum;
    ctx.fillRect(16, 16, 480, 6);
    portrait(ctx, { cx: 157, cy: 301, factor: 0.77, skin: "#B9836B", hair: "#342938", coat: "#42557A" });
    portrait(ctx, { cx: 365, cy: 310, factor: 0.70, skin: "#75513E", hair: "#272C34", coat: "#596274" });
    ctx.fillStyle = PALETTE.ink;
    ctx.font = "600 16px system-ui";
    ctx.fillText("TWO DRAWN ADULTS · NO REAL FACES", 38, 592);
}
//# sourceMappingURL=subject-drawing.js.map