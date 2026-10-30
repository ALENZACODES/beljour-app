/** Original minimal PDF writer for the two-page W93 consultation pack.
 * Standard PDF base font, JPEG photo streams and monochrome map hatching; no
 * fonts, packages, remote assets or tracking. Author: John Khan.
 */
import { stripJpegMetadata, canvasEncoder } from "../save/export.js";
import { labText } from "./pack.js";
export const utf8 = (text) => new TextEncoder().encode(text);
export function join(parts) {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}
// Built-in Helvetica with WinAnsi. Unsupported characters are transliterated in
// this printable copy; the UTF-8 text companion preserves the original wording.
export function printable(value) {
    return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/Δ/g, "Delta ")
        .replace(/[→]/g, " -> ").replace(/[×]/g, "x").replace(/[·]/g, " - ").replace(/[–—]/g, "-")
        .replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
}
export function wrapText(text, width = 82) {
    const out = [];
    for (const paragraph of text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
            if (line && line.length + word.length + 1 > width) {
                out.push(line);
                line = "";
            }
            if (word.length > width) {
                if (line) {
                    out.push(line);
                    line = "";
                }
                for (let i = 0; i < word.length; i += width)
                    out.push(word.slice(i, i + width));
            }
            else
                line = line ? `${line} ${word}` : word;
        }
        if (line || !paragraph)
            out.push(line);
    }
    return out;
}
export function line(text, x, y, size = 12) {
    return `BT /F1 ${size} Tf ${x} ${y} Td (${printable(text)}) Tj ET\n`;
}
export function lines(rows, x, y, size = 12, gap = 16) {
    return { content: rows.map((text, i) => line(text, x, y - i * gap, size)).join(""), end: y - rows.length * gap };
}
export function fit(width, height, x, y, w, h) {
    const scale = Math.min(w / width, h / height), pw = width * scale, ph = height * scale;
    return `${pw.toFixed(3)} 0 0 ${ph.toFixed(3)} ${(x + (w - pw) / 2).toFixed(3)} ${(y + (h - ph) / 2).toFixed(3)}`;
}
export function stream(dictionary, bytes) {
    return join([utf8(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`), bytes, utf8("\nendstream")]);
}
export function rgba(image) {
    const data = new Uint8Array(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i++) {
        for (let c = 0; c < 3; c++)
            data[i * 4 + c] = image.data[i * image.channels + c];
        data[i * 4 + 3] = image.channels === 4 ? image.data[i * 4 + 3] : 255;
    }
    return { width: image.width, height: image.height, data };
}
/** A compact hatch map that prints without depending on colour differentiation. */
export function hatchMap(map, x0, y0) {
    const w = 130, h = 65;
    let out = `0 G ${x0} ${y0} ${w} ${h} re S\n`;
    for (let y = 0; y < 13; y++)
        for (let x = 0; x < 26; x++) {
            const at = Math.min(map.height - 1, Math.floor((y + .5) * map.height / 13)) * map.width + Math.min(map.width - 1, Math.floor((x + .5) * map.width / 26));
            if (map.values[at] > .15)
                out += `${x0 + x * 5} ${y0 + (12 - y) * 5} m ${x0 + x * 5 + 4} ${y0 + (12 - y) * 5 + 4} l S\n`;
        }
    return out;
}
/** Numbered objects to a PDF 1.4 file with an exact byte cross-reference table. */
export function writePdf(objects, catalog, info) {
    const body = [utf8("%PDF-1.4\n")];
    const offsets = [0];
    let offset = body[0].length;
    objects.forEach((object, index) => {
        offsets.push(offset);
        const chunk = join([utf8(`${index + 1} 0 obj\n`), object, utf8("\nendobj\n")]);
        body.push(chunk);
        offset += chunk.length;
    });
    body.push(utf8(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(value => `${String(value).padStart(10, "0")} 00000 n \n`).join("")
        + `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return join(body);
}
export async function renderPackPdf(pack, encoder = canvasEncoder()) {
    if (pack.photos.length !== 3 || pack.photos[0].role !== "original" || pack.photos[0].light !== "original")
        throw new RangeError("The first pack photo must be the original, followed by two previews.");
    const encoded = [];
    for (const photo of pack.photos) {
        const bytes = await encoder.encode(rgba(photo.image), { type: "image/jpeg", quality: .92, label: photo.role === "preview" ? "Simulation" : null });
        encoded.push(stripJpegMetadata(bytes));
    }
    const objects = [];
    const add = (value) => { objects.push(typeof value === "string" ? utf8(value) : value); return objects.length; };
    const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
    const pages = add("<< /Type /Pages /Count 2 /Kids [4 0 R 5 0 R] >>");
    const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    // Page objects refer to content/image objects assigned below in a fixed order.
    add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /P0 6 0 R >> >> /Contents 9 0 R >>`);
    add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /P1 7 0 R /P2 8 0 R >> >> /Contents 10 0 R >>`);
    for (let i = 0; i < encoded.length; i++) {
        const image = pack.photos[i].image;
        add(stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, encoded[i]));
    }
    const footer = lines(wrapText(pack.footer, 90), 40, 55, 10, 13).content;
    let first = line("Salon Decision Pack", 40, 800, 22) + line(pack.name, 40, 776, 14) + line("1. Your unedited photo and measured facts", 40, 750, 14);
    first += `q ${fit(pack.photos[0].image.width, pack.photos[0].image.height, 40, 378, 515, 350)} cm /P0 Do Q\n`;
    first += line("Your unedited photo - current editor resolution", 40, 360, 11);
    const facts = pack.facts.flatMap(fact => wrapText(`${fact.label}: ${fact.value}`, 82));
    if (pack.allergies.length)
        facts.push(...wrapText("Allergies shared by your choice: " + pack.allergies.join(", "), 82));
    const firstFacts = lines(facts.slice(0, 9), 40, 333);
    first += firstFacts.content;
    const limitRows = pack.limitations.flatMap(value => wrapText(value, 90)).slice(0, 7);
    first += lines(limitRows, 40, Math.min(180, firstFacts.end - 12), 10, 13).content + footer;
    let second = line("2. Target, map and plan", 40, 800, 20);
    const description = lines(wrapText(pack.target.description, 74).slice(0, 3), 40, 772, 12, 15);
    second += description.content + line(labText(pack.target.lab), 40, description.end - 4, 12);
    second += line(pack.target.source, 40, description.end - 22, 9);
    const top = description.end - 55;
    for (let i = 1; i <= 2; i++) {
        const x = i === 1 ? 40 : 310, image = pack.photos[i].image;
        second += `q ${fit(image.width, image.height, x, top - 205, 245, 205)} cm /P${i} Do Q\n`;
        second += line(pack.photos[i].caption, x, top - 223, 10);
    }
    let next = top - 250;
    if (pack.map) {
        second += line("Painted placement: monochrome map", 40, next, 11) + hatchMap(pack.map, 40, next - 76);
        next -= 94;
    }
    const planRows = [...pack.steps.map(step => `${step.tool}: ${step.strength} of 100`), ...pack.plan].flatMap(value => wrapText(value, 86));
    const available = Math.max(1, Math.floor((next - 90) / 14));
    const shown = planRows.slice(0, available);
    if (planRows.length > available)
        shown[shown.length - 1] = "Additional settings are in the included UTF-8 text file.";
    second += lines(shown, 40, next, 11, 14).content + footer;
    add(stream("", utf8(first)));
    add(stream("", utf8(second)));
    const info = add(`<< /Title (${printable("Salon Decision Pack - " + pack.name)}) /Author (John Khan) /Creator (BELJOUR) >>`);
    return { pdf: writePdf(objects, catalog, info), photos: encoded.map((bytes, i) => ({ name: `${i === 0 ? "01-original" : i === 1 ? "02-daylight-simulation" : "03-office-simulation"}.jpg`, bytes })) };
}
//# sourceMappingURL=pdf.js.map