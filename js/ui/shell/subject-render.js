export function toRasterRegion(box, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new RangeError("Invalid drawing dimensions");
    }
    return {
        x: box.x * width,
        y: box.y * height,
        width: box.width * width,
        height: box.height * height,
    };
}
/** A saved canvas state guarantees the next layer's drawing area is unchanged. */
export function paintSubjectOverlays(ctx, box, state, width, height) {
    const bounds = toRasterRegion(box, width, height);
    const strength = Math.max(0, Math.min(1, state.strength / 5));
    ctx.save();
    try {
        ctx.beginPath();
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.clip();
        ctx.translate(bounds.x, bounds.y);
        ctx.scale(bounds.width / 200, bounds.height / 300);
        if (state.hair !== "none") {
            ctx.save();
            ctx.globalAlpha = 0.64 * strength;
            ctx.fillStyle = state.hair === "chestnut" ? "#70412B" : "#263A73";
            ctx.beginPath();
            ctx.ellipse(100, 72, 90, 47, 0, Math.PI, 2 * Math.PI);
            ctx.fill();
            ctx.fillRect(17, 82, 12, 90);
            ctx.fillRect(174, 82, 12, 90);
            ctx.restore();
        }
        if (state.face !== "none") {
            ctx.save();
            ctx.globalAlpha = 0.32 * strength;
            ctx.fillStyle = state.face === "warm" ? "#C26F69" : "#A37BB2";
            ctx.beginPath();
            ctx.ellipse(56, 180, 23, 11, 0.2, 0, Math.PI * 2);
            ctx.ellipse(144, 180, 23, 11, -0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        if (state.details["hair-highlight"] && state.permissions.hair && state.permissions.local) {
            ctx.save();
            ctx.globalAlpha = 0.72 * strength;
            ctx.strokeStyle = "#B38B64";
            ctx.lineWidth = 5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(29, 78);
            ctx.quadraticCurveTo(24, 112, 27, 156);
            ctx.moveTo(174, 78);
            ctx.quadraticCurveTo(182, 112, 177, 156);
            ctx.stroke();
            ctx.restore();
        }
        if (state.details["lip-colour"] && state.permissions.face && state.permissions.local) {
            ctx.save();
            ctx.globalAlpha = 0.68 * strength;
            ctx.fillStyle = "#915063";
            ctx.beginPath();
            ctx.moveTo(73, 221);
            ctx.quadraticCurveTo(100, 210, 127, 221);
            ctx.quadraticCurveTo(100, 240, 73, 221);
            ctx.fill();
            ctx.restore();
        }
        if (state.details.eyeliner && state.permissions.face && state.permissions.local) {
            ctx.save();
            ctx.globalAlpha = 0.85 * strength;
            ctx.strokeStyle = "#263A73";
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(41, 150);
            ctx.quadraticCurveTo(62, 145, 85, 150);
            ctx.moveTo(115, 150);
            ctx.quadraticCurveTo(138, 145, 159, 150);
            ctx.stroke();
            ctx.restore();
        }
        if (state.mock) {
            ctx.save();
            ctx.globalAlpha = 0.85 * strength;
            ctx.strokeStyle = "#263A73";
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.ellipse(61, 151, 29, 19, 0, 0, Math.PI * 2);
            ctx.ellipse(140, 151, 29, 19, 0, 0, Math.PI * 2);
            ctx.moveTo(91, 151);
            ctx.lineTo(109, 151);
            ctx.stroke();
            ctx.restore();
        }
    }
    finally {
        ctx.restore();
    }
}
