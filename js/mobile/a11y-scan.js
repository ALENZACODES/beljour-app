/** Best-effort runtime accessibility hints for the page already on screen.
 * This is not an automated WCAG verdict or a replacement for a human audit.
 */
import { contrastGrade } from "./a11y-contrast.js";
const DEFAULT_ELEMENTS = 2500;
const DEFAULT_FINDINGS = 80;
const LABELABLE = new Set(["INPUT", "SELECT", "TEXTAREA"]);
const CONTROLS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"]);
const TEXT_TAGS = new Set(["P", "SPAN", "LABEL", "A", "BUTTON", "LI", "DD", "DT", "SUMMARY"]);
const LANDMARKS = new Set(["MAIN", "NAV", "HEADER", "FOOTER", "ASIDE"]);
/** Avoid putting form contents, IDs, face metadata or filenames in exported reports. */
function safeTag(node, order) {
    return `${node.tagName.toLowerCase()} ${order}`;
}
function attr(node, name) {
    return node.getAttribute(name) ?? "";
}
function isHidden(node, style) {
    return node.hidden === true || node.getAttribute("hidden") !== null
        || attr(node, "aria-hidden") === "true" || node.getAttribute("inert") !== null
        || style?.display === "none" || style?.visibility === "hidden";
}
function hasTextLabel(node) {
    return Boolean(attr(node, "aria-label").trim() || attr(node, "aria-labelledby").trim()
        || attr(node, "title").trim() || node.textContent?.trim());
}
function parseSize(input) {
    if (!input)
        return null;
    const found = /^(\d+(?:\.\d+)?)px$/.exec(input.trim());
    if (!found)
        return null;
    const size = Number(found[1]);
    return size > 0 && size < 10000 ? size : null;
}
function roleIsInteractive(node) {
    const role = attr(node, "role");
    return CONTROLS.has(node.tagName.toUpperCase()) || role === "button" || role === "link";
}
function walk(root, max, style) {
    const rows = [];
    const queue = [root];
    let omitted = 0;
    while (queue.length) {
        const node = queue.shift();
        if (!node)
            break;
        if (isHidden(node, style?.(node)))
            continue;
        if (rows.length >= max) {
            omitted += 1 + queue.length;
            break;
        }
        rows.push({ node, element: safeTag(node, rows.length + 1) });
        for (const child of Array.from(node.children)) {
            if (child && typeof child.getAttribute === "function")
                queue.push(child);
        }
    }
    return { rows, omitted };
}
/** Reports static DOM hints, not computed keyboard order or real screen reader speech. */
export function inspectAccessibility(root, options = {}) {
    if (!root || typeof root.tagName !== "string" || typeof root.getAttribute !== "function") {
        throw new TypeError("Accessibility audit needs a document element");
    }
    const maxElements = options.maxElements ?? DEFAULT_ELEMENTS;
    const maxFindings = options.maxFindings ?? DEFAULT_FINDINGS;
    if (!Number.isInteger(maxElements) || maxElements < 1 || maxElements > 5000
        || !Number.isInteger(maxFindings) || maxFindings < 1 || maxFindings > 200) {
        throw new RangeError("Invalid audit limits");
    }
    const { rows, omitted } = walk(root, maxElements, options.style);
    const findings = [];
    const add = (rule, severity, element, message) => {
        if (findings.length < maxFindings)
            findings.push({ rule, severity, element, message });
    };
    const ids = new Map();
    const labels = new Set();
    let previousHeading = 0;
    let landmarks = 0;
    for (const row of rows) {
        if (row.node.tagName.toUpperCase() === "LABEL") {
            const forValue = attr(row.node, "for");
            if (forValue)
                labels.add(forValue);
        }
    }
    for (const row of rows) {
        const node = row.node;
        const tag = node.tagName.toUpperCase();
        const id = attr(node, "id") || node.id || "";
        if (id) {
            if (ids.has(id))
                add("duplicate-id", "needs-fix", row.element, "A document ID appears more than once.");
            else
                ids.set(id, row);
        }
        if (LANDMARKS.has(tag) || ["main", "navigation", "banner", "contentinfo"].includes(attr(node, "role"))) {
            landmarks += 1;
        }
        const heading = /^H([1-6])$/.exec(tag);
        if (heading) {
            const level = Number(heading[1]);
            if (previousHeading && level > previousHeading + 1) {
                add("heading-order", "review-manually", row.element, "Heading level skips one or more levels.");
            }
            previousHeading = level;
        }
        if (tag === "IMG" && !node.getAttribute("alt") !== null) {
            add("image-alt", "needs-fix", row.element, "Image has no alt attribute.");
        }
        if (roleIsInteractive(node) && !hasTextLabel(node) && !(tag === "INPUT" && attr(node, "type") === "hidden")) {
            if (!LABELABLE.has(tag))
                add("control-name", "needs-fix", row.element, "Interactive control has no apparent name.");
        }
        if (LABELABLE.has(tag) && attr(node, "type") !== "hidden") {
            const labelled = hasTextLabel(node) || (id && labels.has(id))
                || (node.parentElement?.tagName.toUpperCase() === "LABEL");
            if (!labelled)
                add("input-label", "needs-fix", row.element, "Form control has no accessible label reference.");
        }
        const style = options.style?.(node);
        if (style && TEXT_TAGS.has(tag) && (node.textContent?.trim().length ?? 0) > 0) {
            const size = parseSize(style.fontSize);
            if (size !== null && size < 12)
                add("font-size", "needs-fix", row.element, "Visible functional text is under 12px.");
            if (style.color && style.backgroundColor) {
                const grade = contrastGrade(style.color, style.backgroundColor);
                if (grade.grade === "low")
                    add("contrast", "review-manually", row.element, "Computed opaque colours have less than 4.5:1 contrast; review ancestor backgrounds.");
            }
        }
        if (roleIsInteractive(node) && typeof node.getBoundingClientRect === "function") {
            const bounds = node.getBoundingClientRect();
            if (bounds.width > 0 && bounds.height > 0 && (bounds.width < 24 || bounds.height < 24)) {
                add("touch-target", "review-manually", row.element, "Interactive bounds are under 24px on one axis.");
            }
        }
        if (roleIsInteractive(node) && attr(node, "tabindex") === "-1") {
            add("focus-visibility", "review-manually", row.element, "Interactive control leaves normal Tab order.");
        }
    }
    for (const row of rows) {
        const reference = attr(row.node, "aria-labelledby");
        for (const candidate of reference.split(/\s+/).filter(Boolean)) {
            if (!ids.has(candidate))
                add("missing-reference", "needs-fix", row.element, "An accessible-name reference cannot be resolved.");
        }
    }
    if (!landmarks)
        add("landmark", "review-manually", "page", "No landmark was found in the inspected area.");
    if (typeof options.viewportWidth === "number" && typeof options.contentWidth === "number"
        && Number.isFinite(options.viewportWidth) && Number.isFinite(options.contentWidth)
        && options.viewportWidth > 0 && options.contentWidth > options.viewportWidth + 1) {
        add("horizontal-overflow", "needs-fix", "page", "Content extends beyond the measured viewport.");
    }
    return {
        inspected: rows.length,
        omitted,
        findings,
        incomplete: omitted > 0 || findings.length === maxFindings,
        disclaimer: "DOM checks are hints only. Keyboard, screen reader, touch, zoom and WCAG need manual verification.",
    };
}
//# sourceMappingURL=a11y-scan.js.map