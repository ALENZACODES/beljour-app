import { announce, clear, h } from "../dom.js";
import { readExpression } from "../face/expression.js";
import { REGIONS, reflect, symmetry, toPixels } from "../face/symmetry.js";
import { measure } from "../engines/proportions/ratios.js";
import { localPreviewError, measuredMesh, needsLocalPhoto } from "./local-preview.js";
import { token } from "../ui/palette.js";
function overlay(ctx) {
    const { w, h: ht } = ctx.size;
    const pts = ctx.face.points;
    const rep = symmetry(pts, w, ht);
    const canvas = h("canvas", { width: w, height: ht, class: "overlay",
        "aria-label": `Your photo with the fitted midline in blue and mirrored points. Overall symmetry ${rep.score} out of 100.` });
    const img = new Image();
    img.onload = () => {
        const g = canvas.getContext("2d");
        g.drawImage(img, 0, 0, w, ht);
        const L = rep.midline, far = Math.max(w, ht);
        g.strokeStyle = token("plum");
        g.lineWidth = Math.max(2, w / 400);
        g.beginPath();
        g.moveTo(L.cx - L.dx * far, L.cy - L.dy * far);
        g.lineTo(L.cx + L.dx * far, L.cy + L.dy * far);
        g.stroke();
        const px = toPixels(pts, w, ht);
        const r = Math.max(2, w / 300);
        for (const pairs of Object.values(REGIONS)) {
            for (const [right, left] of pairs) {
                const m = reflect(px[right], L);
                g.fillStyle = token("cream");
                g.beginPath();
                g.arc(px[left][0], px[left][1], r, 0, Math.PI * 2);
                g.fill();
                g.strokeStyle = token("plum");
                g.lineWidth = Math.max(1, w / 600);
                g.beginPath();
                g.arc(m[0], m[1], r * 1.6, 0, Math.PI * 2);
                g.stroke();
            }
        }
    };
    img.src = ctx.photoSrc;
    return h("section", {}, h("h2", {}, "Symmetry"), h("p", {}, `Overall ${rep.score} out of 100. The blue line is the centre line fitted through your nose, lips and chin. White dots are your left side; blue rings are your right side mirrored across the line. The closer they sit, the more the two sides match.`), canvas, h("ul", { class: "bars" }, ...rep.regions.map((r) => h("li", {}, h("span", {}, r.name[0].toUpperCase() + r.name.slice(1)), h("span", { class: "bar", role: "img", "aria-label": `${r.score} out of 100` }, h("span", { style: { width: `${r.score}%` } })), h("span", { class: "num" }, String(r.score))))), h("p", { class: "fine" }, `Head tilt in the photo: ${rep.tiltDegrees} degrees. Small tilts and turns lower the score, so compare photos taken the same way. Almost no face is perfectly symmetric.`));
}
function expression(blend) {
    const e = readExpression(blend);
    return h("section", {}, h("h2", {}, "How this photo comes across"), h("p", { class: "notice" }, "Just for fun. This reads the expression in this one photo. It isn't a personality test and says nothing about who you are."), h("p", {}, `Smile: ${e.smileType}.`), h("ul", { class: "bars" }, ...e.impressions.map((i) => h("li", {}, h("span", {}, i.label), h("span", { class: "bar", role: "img", "aria-label": `${i.score} out of 100` }, h("span", { style: { width: `${i.score}%` } })), h("span", { class: "num" }, String(i.score))))), h("ul", { class: "plain-list fine" }, ...e.impressions.map((i) => h("li", {}, `${i.label}: ${i.why}.`))), h("p", { class: "fine" }, "Read from the face movements MediaPipe measures: " + e.cues.map((c) => `${c.name.toLowerCase()} ${c.value}`).join(", ") + "."));
}
function ratioRow(r) {
    const fmt = (value) => (Array.isArray(value) ? value : [value, 1])
        .map(x => Number.isInteger(x) ? x : x.toFixed(2)).join(" : ");
    const row = h("li", { class: "ratio" }, h("div", { class: "ratio-head" }, h("strong", {}, r.label), h("span", { class: "fine" }, r.parts)));
    if (r.reference !== null && r.differencePercent !== null) {
        const pos = Math.max(-25, Math.min(25, r.differencePercent));
        row.append(h("div", { class: "dev", role: "img", "aria-label": `${r.differencePercent.toFixed(1)}% from the reference` }, h("span", { class: "dev-zero" }), h("span", { class: "dev-dot", style: { left: `${50 + pos * 2}%` } })), h("p", {}, `Yours ${fmt(r.value)}. Reference ${fmt(r.reference)}. ${r.plain}`));
    }
    else
        row.append(h("p", {}, `Yours ${fmt(r.value)}. No reference value is used for this measurement.`));
    return row;
}
export function renderProportions(main, ctx) {
    clear(main);
    if (needsLocalPhoto(ctx))
        return;
    const out = h("div", { "aria-live": "polite" });
    main.append(h("h1", {}, "Proportions and symmetry"), h("p", { class: "lede" }, "Measurements, not a verdict. Faces differ, and a number away from a reference isn't something that needs fixing."));
    if (ctx.face && ctx.size) {
        try {
            main.append(overlay(ctx));
        }
        catch { /* landmark set incomplete */ }
        if (Object.keys(ctx.face.blendshapes).length)
            main.append(expression(ctx.face.blendshapes));
    }
    else {
        main.append(h("p", { class: "notice notice-warn" }, "Symmetry needs face points from your browser, which weren't available for this photo."));
    }
    const run = h("button", { class: "btn", type: "button" }, "Measure ratios on this device");
    run.addEventListener("click", () => {
        clear(out);
        try {
            if (!ctx.size)
                throw new Error("Choose a photo before measuring.");
            const points = measuredMesh(ctx.face?.points, ctx.size.w, ctx.size.h);
            const report = measure(points);
            const rows = report.ratios.filter(item => (Array.isArray(item.value) ? item.value : [item.value]).every(Number.isFinite));
            out.append(h("p", { class: "source" }, "Local simulation. Measured on this device; no YouCam call."), h("ul", { class: "ratios" }, ...rows.map(ratioRow)), h("p", { class: "fine" }, report.note));
            announce("Local ratios ready.");
        }
        catch (error) {
            out.append(localPreviewError(error));
        }
    });
    main.append(h("h2", {}, "Face ratios"), h("p", {}, "Local simulation. These ratios use your measured face points. Reference ratios do not rate your appearance and are not targets."), run, out);
}
//# sourceMappingURL=proportions.js.map