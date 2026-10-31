/** Own-brand portrait frame for the drawn tour. Author: John Khan. */
import { createHouseArt } from "./house-art.js";
export function validateCoverReading(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid cover reading");
    }
    const item = value;
    if (Object.keys(item).length !== 5
        || !["drawn", "unavailable"].includes(String(item.origin))
        || !["main", "second", "none"].includes(String(item.subject))
        || typeof item.step !== "string" || !/^[a-z][a-z-]{0,23}$/.test(item.step)
        || !Number.isInteger(item.position) || Number(item.position) < 1
        || !Number.isInteger(item.total) || Number(item.total) > 30
        || Number(item.position) > Number(item.total)
        || (item.origin === "unavailable" && item.subject !== "none")
        || (item.origin === "drawn" && item.subject === "none")) {
        throw new Error("Cover fields must describe the current drawing only");
    }
    return item;
}
function node(doc, tag, className, text) {
    const result = doc.createElement(tag);
    result.className = className;
    if (text !== undefined)
        result.textContent = text;
    return result;
}
function subjectText(subject) {
    return subject === "main" ? "Primary drawing" : subject === "second"
        ? "Second drawing" : "Drawing unavailable";
}
/** A content frame, not a reproduction of any publication cover. */
export function createEditorialCover(doc, canvas, value) {
    const reading = validateCoverReading(value);
    const frame = node(doc, "figure", "lg-editorial-cover");
    frame.dataset.coverOrigin = reading.origin;
    frame.dataset.editorialStage = "page";
    frame.setAttribute("aria-label", "BELJOUR — FULL BEAUTY STUDIO. Your best day. Still you. Illustrated portrait presentation");
    const top = node(doc, "div", "lg-editorial-cover-top");
    const brand = node(doc, "span", "lg-editorial-cover-brand", "BELJOUR");
    const descriptor = node(doc, "span", "lg-editorial-brand-descriptor", "FULL BEAUTY STUDIO");
    const tagline = node(doc, "span", "lg-editorial-brand-tagline", "Your best day. Still you.");
    const lockup = node(doc, "span", "lg-editorial-brand-lockup");
    lockup.append(brand, descriptor, tagline);
    const edition = node(doc, "span", "lg-editorial-cover-edition", "Atelier / Drawn studies");
    top.append(lockup, edition);
    const picture = node(doc, "div", "lg-editorial-cover-picture");
    if (reading.origin === "drawn" && canvas) {
        canvas.setAttribute("aria-label", "Original drawn figures with simulated local edits");
        picture.append(canvas);
    }
    else {
        picture.append(createHouseArt(doc, "portrait"));
    }
    const footer = node(doc, "figcaption", "lg-editorial-cover-footer");
    const summary = node(doc, "span", "lg-editorial-cover-caption", subjectText(reading.subject));
    const stage = node(doc, "span", "lg-editorial-cover-progress", `${reading.position} / ${reading.total} · ${reading.step.replaceAll("-", " ")}`);
    footer.append(summary, stage);
    const disclaimer = node(doc, "span", "lg-editorial-cover-disclaimer", "Local illustration · No provider result");
    frame.append(top, picture, footer, disclaimer);
    return frame;
}
/** Limited review metadata, never a person's name, image bytes or provider identity. */
export function coverAudit(value) {
    const reading = validateCoverReading(value);
    return {
        format: "beljour-editorial-cover/1",
        source: reading.origin === "drawn" ? "drawn" : "not-loaded",
        subjectChosen: reading.subject !== "none",
        liveProviderVerified: false,
    };
}
