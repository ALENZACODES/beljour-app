export function roundedRect(p, x, y, w, h, radius) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    p.beginPath();
    if (r === 0) {
        p.moveTo(x, y);
        p.lineTo(x + w, y);
        p.lineTo(x + w, y + h);
        p.lineTo(x, y + h);
        p.closePath();
        return;
    }
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y);
    p.quadraticCurveTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r);
    p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h);
    p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r);
    p.quadraticCurveTo(x, y, x + r, y);
    p.closePath();
}
export function archPath(p, x, y, w, h) {
    const r = Math.min(w / 2, h);
    p.beginPath();
    p.moveTo(x, y + h);
    p.lineTo(x, y + r);
    p.arc(x + w / 2, y + r, w / 2, Math.PI, 0);
    p.lineTo(x + w, y + h);
    p.closePath();
}
export function ellipseBox(p, x, y, w, h) {
    p.beginPath();
    p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    p.closePath();
}
/** The path of a cell shape, for clipping a photo into it. */
export function shapePath(p, shape, x, y, w, h, radius) {
    if (shape === "circle")
        ellipseBox(p, x, y, w, h);
    else if (shape === "arch")
        archPath(p, x, y, w, h);
    else
        roundedRect(p, x, y, w, h, radius);
}
