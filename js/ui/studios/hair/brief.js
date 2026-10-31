/** Salon conversation notes and a print-safe grid, without storing photos.
 * The user's chosen styles are transferable decisions, not photographic claims.
 * Never serializes a portrait, reference image bytes, object URL, face attributes,
 * YouCam key, skin metadata or consent token. Offline-only; no fetch.
 * Author: John Khan.
 */
import { styleById, clampStrength } from "./model.js";
import { hairDiagramSvg } from "./diagram.js";
import { PALETTE } from "../../palette.js";
export const SALON_FORMAT = "beljour-salon-brief/1";
export const MAX_NOTES = 600;
export const MAX_TITLE = 96;
export const MAX_BOARD = 9;
const MODIFIERS = ["bangs", "curl", "extension", "volume"];
function normalizedText(value, limit, name) {
    if (typeof value !== "string")
        throw new TypeError(`${name} must be text`);
    const output = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .normalize("NFC").trim();
    if (output.length > limit)
        throw new RangeError(`${name} is too long`);
    return output;
}
function xml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function choice(style) {
    return { id: style.id, name: style.name, description: style.description,
        lengths: [...style.lengths], textures: [...style.textures],
        source: style.source, tags: [...style.tags] };
}
function fromId(id) {
    const style = styleById(id);
    if (!style)
        throw new RangeError(`Unknown haircut ${id}`);
    return choice(style);
}
function labels(selection, primary) {
    const recommendations = [];
    const name = primary.name.toLowerCase();
    if (primary.id.startsWith("idea-"))
        recommendations.push("Show this as inspiration, not a rendered preview.");
    else
        recommendations.push("S1 entries are synthetic; request a verified live template before spending units.");
    if (primary.tags.includes("fade") || name.includes("fade"))
        recommendations.push("Ask which clipper guard lengths and fade height work with your current hair.");
    if (primary.tags.includes("bob") || name.includes("bob"))
        recommendations.push("Discuss where the perimeter will sit when your hair dries naturally.");
    if (primary.tags.includes("curls") || primary.tags.includes("coils"))
        recommendations.push("Confirm that the cut will respect your natural curl or coil pattern.");
    if (primary.tags.includes("braids") || primary.tags.includes("twists"))
        recommendations.push("Ask about sectioning and maintenance appropriate to your hair.");
    if (primary.tags.includes("wedding") || primary.tags.includes("event"))
        recommendations.push("Consider a trial in similar light and from multiple angles before your event.");
    if (primary.lengths.includes("long"))
        recommendations.push("Agree on the amount of length to retain before cutting.");
    if (selection.keepColour)
        recommendations.push("Keep your natural/current colour unless you request a separate change.");
    for (const name of MODIFIERS)
        if (selection.adjuncts[name] > 0) {
            const phrase = name === "extension" ? "added length" : name === "volume" ? "fullness" : name;
            recommendations.push(`Discuss ${phrase} at your ${selection.adjuncts[name]}/100 preference, adjusting for your natural texture.`);
        }
    recommendations.push("Check your style from the front, both sides, and after ordinary wear.");
    return recommendations;
}
/** Non-photographic exchange file for an in-person styling conversation. */
export function buildSalonBrief(selection, board, options = {}) {
    if (board.size !== 4 && board.size !== 9)
        throw new RangeError("Board must be 2x2 or 3x3");
    const primary = fromId(selection.styleId);
    const selected = board.tiles.filter((t) => t.styleId && t.styleId !== selection.styleId)
        .map((t) => t.styleId);
    const ids = [...new Set(selected)].slice(0, MAX_BOARD - 1);
    const modifiers = { bangs: clampStrength(selection.adjuncts.bangs),
        curl: clampStrength(selection.adjuncts.curl),
        extension: clampStrength(selection.adjuncts.extension), volume: clampStrength(selection.adjuncts.volume) };
    if (selection.referenceRights && !selection.reference)
        throw new RangeError("Rights cannot exist without a reference");
    const title = normalizedText(options.title ?? "My haircut consultation", MAX_TITLE, "Brief title");
    const personalNotes = normalizedText(options.notes ?? "", MAX_NOTES, "Personal notes");
    if (!title)
        throw new RangeError("Brief title cannot be empty");
    return { format: SALON_FORMAT, title, primary, alternatives: ids.map(fromId),
        keepCurrentColour: Boolean(selection.keepColour), strength: clampStrength(selection.strength),
        modifiers, personalNotes, referenceProvided: Boolean(selection.reference),
        rightsAcknowledged: Boolean(selection.reference && selection.referenceRights && options.referenceRights !== false),
        guidance: labels(selection, primary),
        disclosure: "Style plans and diagrams only. Not results on your face. YouCam results need a separate request and consent." };
}
function assertChoice(value, name) {
    if (typeof value !== "object" || !value)
        throw new TypeError(`${name}: expected a cut`);
    const cut = value;
    if (typeof cut.id !== "string" || !styleById(cut.id))
        throw new RangeError(`${name}: unknown haircut`);
    const expected = fromId(cut.id);
    if (cut.name !== expected.name || cut.description !== expected.description ||
        cut.source !== expected.source || JSON.stringify(cut.lengths) !== JSON.stringify(expected.lengths) ||
        JSON.stringify(cut.textures) !== JSON.stringify(expected.textures) ||
        JSON.stringify(cut.tags) !== JSON.stringify(expected.tags))
        throw new RangeError(`${name}: altered or unverified catalogue values`);
}
/** Strict import so a saved brief cannot create new provider IDs or a forged 'live' result. */
export function parseSalonBrief(input, maxBytes = 40_000) {
    if (typeof input !== "string" || input.length > maxBytes)
        throw new RangeError("Invalid brief file size");
    const value = JSON.parse(input);
    if (typeof value !== "object" || !value)
        throw new TypeError("Not a salon brief");
    const body = value;
    if (body.format !== SALON_FORMAT || body.disclosure !==
        "Style plans and diagrams only. Not results on your face. YouCam results need a separate request and consent.")
        throw new RangeError("Unsupported salon brief format or disclosure");
    assertChoice(body.primary, "Primary cut");
    if (!Array.isArray(body.alternatives) || body.alternatives.length > MAX_BOARD - 1)
        throw new RangeError("Too many alternative cuts");
    for (const [index, alternative] of body.alternatives.entries())
        assertChoice(alternative, `Alternative ${index}`);
    if (typeof body.strength !== "number" || clampStrength(body.strength) !== body.strength)
        throw new RangeError("Unacceptable haircut strength");
    if (typeof body.modifiers !== "object" || !body.modifiers)
        throw new TypeError("Missing modifiers");
    const values = body.modifiers;
    if (Object.keys(values).sort().join("|") !== [...MODIFIERS].sort().join("|"))
        throw new RangeError("Unknown modifier in salon brief");
    for (const key of MODIFIERS)
        if (typeof values[key] !== "number" || clampStrength(values[key]) !== values[key])
            throw new RangeError(`${key} must be an integer from 0 to 100`);
    if (typeof body.keepCurrentColour !== "boolean" || typeof body.referenceProvided !== "boolean" ||
        typeof body.rightsAcknowledged !== "boolean")
        throw new TypeError("Invalid Boolean field");
    if (body.rightsAcknowledged && !body.referenceProvided)
        throw new RangeError("Rights claimed with no reference");
    if (normalizedText(body.title, MAX_TITLE, "title") !== body.title || !body.title)
        throw new RangeError("Bad title");
    if (normalizedText(body.personalNotes, MAX_NOTES, "notes") !== body.personalNotes)
        throw new RangeError("Bad notes");
    if (!Array.isArray(body.guidance) || body.guidance.some((item) => typeof item !== "string"))
        throw new TypeError("Invalid consultation guidance");
    if (JSON.stringify(body).includes("data:image/") || JSON.stringify(body).includes("photo_id") ||
        JSON.stringify(body).includes("localPreview") || JSON.stringify(body).includes("YOUCAM_API_KEY"))
        throw new RangeError("Salon brief must not include photo or secret data");
    return body;
}
export function salonBriefJson(brief) {
    return JSON.stringify(brief, null, 2) + "\n";
}
export function salonBriefText(brief) {
    const lines = [brief.title, "BELJOUR — haircut consultation (not a photo preview)",
        "", `Chosen cut: ${brief.primary.name}`, brief.primary.description,
        `Length groups: ${brief.primary.lengths.join(", ")}`,
        `Natural hair textures: ${brief.primary.textures.join(", ")}`,
        `Cut preference: ${brief.strength}/100 — gentle first`,
        `Keep current hair colour: ${brief.keepCurrentColour ? "yes" : "no"}`,
        `Reference photo selected: ${brief.referenceProvided ? "yes" : "no"}`,
        `Right to use reference confirmed: ${brief.rightsAcknowledged ? "yes" : "no"}`,
        "", "Optional styling preferences (not a promise of the result):",
        ...MODIFIERS.map((name) => `• ${name}: ${brief.modifiers[name]}/100`), "",
        "Other cuts to discuss:", ...brief.alternatives.map((cut, i) => `${i + 1}. ${cut.name} — ${cut.description}`),
        "", "Stylist conversation:", ...brief.guidance.map((item) => `• ${item}`),
        "", `My notes: ${brief.personalNotes || "—"}`, "", brief.disclosure];
    return lines.join("\n") + "\n";
}
/** A printable, privacy-preserving comparison of *diagrams* only.
 * The board does not rasterize an uploaded face, or claim that unrendered cells
 * contain distinct YouCam outcomes. Each tile has a visible disclosure.
 */
export function salonBoardSvg(brief, grid, background = "light") {
    if (grid !== 4 && grid !== 9)
        throw new RangeError("2x2 or 3x3 only");
    if (!["light", "white"].includes(background))
        throw new RangeError("Unknown paper style");
    const count = grid === 4 ? 2 : 3;
    const cell = grid === 4 ? 280 : 235;
    const gap = 18;
    const pad = 36;
    const width = 2 * pad + count * cell + (count - 1) * gap;
    const height = 170 + count * (cell + 52) + (count - 1) * gap + 52;
    const cuts = [brief.primary, ...brief.alternatives];
    const rows = [];
    // A saved board: the fixed light interface palette (ui/palette.ts); the cut drawings keep theirs.
    const paper = background === "light" ? PALETTE.panel : PALETTE.surface;
    rows.push(`<rect width="${width}" height="${height}" fill="${paper}"/>`);
    rows.push(`<rect x="0" width="${width / 3}" height="8" fill="${PALETTE.plum}"/>`);
    rows.push(`<rect x="${width / 3}" width="${width / 3}" height="8" fill="${PALETTE.blush}"/>`);
    rows.push(`<rect x="${2 * width / 3}" width="${width / 3}" height="8" fill="${PALETTE.wine}"/>`);
    rows.push(`<text x="${pad}" y="50" font-family="Georgia,serif" font-size="26" fill="${PALETTE.plum}">${xml(brief.title.slice(0, 55))}</text>`);
    rows.push(`<text x="${pad}" y="75" font-family="system-ui,sans-serif" font-size="13" fill="${PALETTE.muted}">Cut diagrams only · original artwork · never your face</text>`);
    rows.push(`<text x="${pad}" y="103" font-family="system-ui,sans-serif" font-size="11" fill="${PALETTE.muted}">Styling strength ${brief.strength}/100 · Keep current colour ${brief.keepCurrentColour ? "yes" : "no"}</text>`);
    for (let index = 0; index < grid; index++) {
        const x = pad + (index % count) * (cell + gap);
        const y = 131 + Math.floor(index / count) * (cell + gap + 52);
        const chosen = cuts[index];
        rows.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell + 47}" rx="12" fill="${PALETTE.surface}" stroke="${PALETTE.rule}" stroke-width="1.2"/>`);
        if (!chosen) {
            rows.push(`<text x="${x + cell / 2}" y="${y + cell / 2}" text-anchor="middle" fill="${PALETTE.muted}" font-family="system-ui,sans-serif" font-size="15">Choose another cut</text>`);
            continue;
        }
        const style = styleById(chosen.id);
        if (!style)
            throw new RangeError("Unknown cut in board");
        const illustration = hairDiagramSvg(style, { size: 145, tone: index % 3 === 0 ? "blue" : "neutral", guides: false });
        const embedded = illustration.replace(/<svg[^>]*>/, "").replace("</svg>", "");
        rows.push(`<svg x="${x + (cell - 145) / 2}" y="${y + 13}" width="145" height="203" viewBox="0 0 124 174">${embedded}</svg>`);
        rows.push(`<text x="${x + 16}" y="${y + cell - 12}" font-size="14" font-weight="bold" fill="${PALETTE.ink}" font-family="system-ui,sans-serif">${xml(chosen.name.slice(0, 31))}</text>`);
        rows.push(`<text x="${x + 16}" y="${y + cell + 8}" font-size="11" fill="${PALETTE.muted}" font-family="system-ui,sans-serif">${chosen.source === "inspiration" ? "Inspiration only — not rendered" : "Synthetic list — live not verified"}</text>`);
        rows.push(`<text x="${x + 16}" y="${y + cell + 26}" font-size="10" fill="${PALETTE.muted}" font-family="system-ui,sans-serif">${xml(chosen.description.slice(0, 42))}</text>`);
    }
    rows.push(`<text x="${pad}" y="${height - 24}" font-family="system-ui,sans-serif" font-size="10" fill="${PALETTE.muted}">${xml(brief.disclosure)}</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="Haircut consultation board; unrendered diagrams only">${rows.join("")}</svg>`;
}
