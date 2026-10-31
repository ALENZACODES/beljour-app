/** Print-friendly, local observational Proof Wall image. Author: John Khan. */
import { proofWallReading } from "./proof.js";
import { PALETTE } from "../../ui/palette.js";
export const PROOF_GRAPHIC_SIZE = { width: 1080, height: 1350 };
const SVG_NS = "http://www.w3.org/2000/svg";
// A generated, printable file: the fixed light palette (ui/palette.ts), never the page theme.
const BLUE = PALETTE.plum;
const RED = PALETTE.wine;
const PAPER = PALETTE.cream;
const BODY = PALETTE.ink;
const MUTED = PALETTE.muted;
const RULE = PALETTE.rule;
const STATE_TEXT = {
    observed: "OBSERVED LOCALLY",
    mock: "MOCK ONLY",
    pending: "NOT VERIFIED",
};
/** Values come from fixed, validated copy; XML encoding remains defensive. */
export function xmlText(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
export function breakProofText(value, limit = 38) {
    if (!Number.isInteger(limit) || limit < 12 || limit > 48) {
        throw new RangeError("Proof text width is out of range");
    }
    const parts = value.trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of parts) {
        if (word.length > limit)
            throw new RangeError("Proof copy cannot fit this design");
        if (current && current.length + word.length + 1 > limit) {
            lines.push(current);
            current = "";
        }
        current += (current ? " " : "") + word;
    }
    if (current)
        lines.push(current);
    if (lines.length > 3)
        throw new RangeError("Proof copy exceeds review page bounds");
    return lines;
}
function textLine(x, y, value, size, options = {}) {
    const colour = options.colour ?? BODY;
    const family = options.family === "serif" ? "Georgia,serif" : "Arial,sans-serif";
    const tracking = options.tracking ?? 0;
    return `<text x="${x}" y="${y}" fill="${colour}" font-size="${size}" `
        + `font-family="${family}" letter-spacing="${tracking}">`
        + xmlText(value) + "</text>";
}
function hairline(x1, y, x2) {
    return `<path d="M${x1} ${y}H${x2}" fill="none" stroke="${RULE}" stroke-width="1"/>`;
}
export function proofGraphicSummary(input) {
    const reading = proofWallReading(input);
    const observed = reading.entries.filter((entry) => entry.state === "observed").length;
    const mock = reading.entries.filter((entry) => entry.state === "mock").length;
    const pending = reading.entries.filter((entry) => entry.state === "pending").length;
    return {
        format: "beljour-proof-graphic/1", observed, mock, pending,
        readyForRelease: false,
        source: "local-demo-observations",
    };
}
function proofCell(entry, left, top) {
    const width = 460;
    const innerLeft = left + 14;
    const start = top + 42;
    const lines = breakProofText(entry.description);
    const parts = [
        hairline(left, top, left + width),
        textLine(innerLeft, top + 32, entry.heading, 26, { colour: BLUE, family: "serif" }),
        textLine(innerLeft, top + 62, STATE_TEXT[entry.state], 14, { colour: entry.state === "pending" ? MUTED : BLUE, tracking: 1.5 }),
    ];
    for (let index = 0; index < lines.length; index += 1) {
        parts.push(textLine(innerLeft, start + 62 + index * 26, lines[index], 18));
    }
    return parts.join("\n");
}
/** Self-contained SVG. No external images, fonts, scripts or face data. */
export function proofGraphicSvg(input) {
    const reading = proofWallReading(input);
    const summary = proofGraphicSummary(input);
    const parts = [
        `<svg xmlns="${SVG_NS}" width="${PROOF_GRAPHIC_SIZE.width}" `
            + `height="${PROOF_GRAPHIC_SIZE.height}" viewBox="0 0 1080 1350" `
            + 'role="img" aria-label="BELJOUR — FULL BEAUTY STUDIO. Your best day. Still you. Proof Wall, local demo observations only">',
        `<rect width="1080" height="1350" fill="${PAPER}"/>`,
        `<path d="M66 68H1014" fill="none" stroke="${BLUE}" stroke-width="2"/>`,
        textLine(66, 117, "BELJOUR", 31, { colour: BLUE, family: "serif", tracking: -0.7 }),
        textLine(275, 115, "FULL BEAUTY STUDIO", 16, { colour: BLUE, tracking: 1.0 }),
        textLine(66, 151, "Your best day. Still you.", 19, { colour: MUTED, family: "serif" }),
        textLine(827, 116, "ATELIER / EVIDENCE", 14, { colour: BLUE, tracking: 2 }),
        textLine(66, 220, "The Proof Wall", 66, { colour: BLUE, family: "serif", tracking: -1.6 }),
        textLine(68, 269, "OBSERVED IN THIS BROWSER · NOT RELEASE CERTIFICATION", 16, { colour: MUTED, tracking: 1.15 }),
        hairline(66, 298, 1014),
        textLine(68, 345, `${summary.observed} local observations`, 24, { colour: BLUE, family: "serif" }),
        textLine(420, 345, `${summary.mock} mock`, 24, { colour: BLUE, family: "serif" }),
        textLine(625, 345, `${summary.pending} not verified`, 24, { colour: BLUE, family: "serif" }),
    ];
    for (let index = 0; index < reading.entries.length; index += 1) {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const left = column === 0 ? 68 : 552;
        const top = 393 + row * 194;
        parts.push(proofCell(reading.entries[index], left, top));
    }
    parts.push(hairline(66, 1200, 1014));
    parts.push(textLine(66, 1242, "Original local illustration and manual review only.", 18));
    parts.push(textLine(66, 1274, "Live YouCam, real-face and 100,000-face gates need separate evidence.", 17, { colour: MUTED }));
    parts.push(`<path d="M948 1264H1014" fill="none" stroke="${RED}" stroke-width="2"/>`);
    parts.push("</svg>\n");
    const output = parts.join("\n");
    if (output.length > 24_000 || /<script\b|<image\b|<foreignObject\b/i.test(output)) {
        throw new Error("Unsafe graphic output");
    }
    return output;
}
/** Only a user gesture invokes this. An actual saved file is not proven by clicking. */
export function downloadProofGraphic(doc, input) {
    const content = proofGraphicSvg(input);
    const blob = new Blob([content], { type: "image/svg+xml" });
    if (blob.size > 24_000)
        throw new RangeError("Unexpected proof graphic size");
    const url = URL.createObjectURL(blob);
    try {
        const link = doc.createElement("a");
        link.href = url;
        link.download = "BELJOUR_Proof_Wall_Local_Review.svg";
        link.hidden = true;
        doc.body.append(link);
        link.click();
        link.remove();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
