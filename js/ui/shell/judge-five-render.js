export function paintSingleExtraEdits(ctx, state, gain) {
    if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
        throw new RangeError("Invalid illustrative strength");
    }
    ctx.save();
    try {
        if (state.details["hair-highlight"] && state.permissions.local && state.permissions.hair) {
            ctx.save();
            ctx.globalAlpha = 0.73 * gain;
            ctx.strokeStyle = "#B38B64";
            ctx.lineWidth = 8;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(177, 180);
            ctx.quadraticCurveTo(163, 242, 163, 305);
            ctx.moveTo(335, 180);
            ctx.quadraticCurveTo(349, 232, 349, 305);
            ctx.stroke();
            ctx.restore();
        }
        if (state.details["lip-colour"] && state.permissions.local && state.permissions.face) {
            ctx.save();
            ctx.globalAlpha = 0.6 * gain;
            ctx.fillStyle = "#915063";
            ctx.beginPath();
            ctx.moveTo(222, 402);
            ctx.quadraticCurveTo(256, 386, 290, 402);
            ctx.quadraticCurveTo(256, 425, 222, 402);
            ctx.fill();
            ctx.restore();
        }
        if (state.details.eyeliner && state.permissions.local && state.permissions.face) {
            ctx.save();
            ctx.globalAlpha = 0.85 * gain;
            ctx.strokeStyle = "#263A73";
            ctx.lineWidth = 5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(186, 312);
            ctx.quadraticCurveTo(210, 306, 236, 312);
            ctx.lineTo(242, 305);
            ctx.moveTo(276, 312);
            ctx.quadraticCurveTo(301, 306, 325, 312);
            ctx.lineTo(332, 305);
            ctx.stroke();
            ctx.restore();
        }
    }
    finally {
        ctx.restore();
    }
}
//# sourceMappingURL=judge-five-render.js.map