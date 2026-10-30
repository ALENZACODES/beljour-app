const MAX_CONTROLS = 320;
const MAX_NODES = 1400;
const FINDINGS = [
    "no-current-heading", "duplicate-id", "unnamed-button", "unnamed-input",
    "missing-slider-range", "invalid-strength-step", "invalid-pressed-state",
    "invalid-expanded-state", "undersized-button", "control-limit",
    "broken-aria-reference", "missing-canvas-description",
    "multiple-main-landmarks", "missing-status-region",
];
function named(node) {
    const aria = node.getAttribute("aria-label");
    if (aria && aria.trim().length > 0)
        return true;
    const labelledBy = node.getAttribute("aria-labelledby");
    if (labelledBy && labelledBy.trim().length > 0)
        return true;
    return Boolean(node.textContent?.trim());
}
function hasNativeLabel(node) {
    if (named(node))
        return true;
    const parent = node.parentNode;
    return parent?.tagName?.toUpperCase() === "LABEL"
        && Boolean(parent.textContent?.trim());
}
function rangeBounds(node) {
    const min = Number(node.min ?? node.getAttribute("min"));
    const max = Number(node.max ?? node.getAttribute("max"));
    const step = Number(node.step ?? node.getAttribute("step"));
    return Number.isFinite(min) && Number.isFinite(max)
        && Number.isFinite(step) && min < max && step > 0;
}
function isStrength(node) {
    return node.dataset?.editStrength === "true"
        || node.dataset?.tourAction?.startsWith("strength-") === true
        || node.getAttribute("data-edit-strength") === "true"
        || node.getAttribute("data-tour-action")?.startsWith("strength-") === true;
}
function checkedStrength(node) {
    const min = Number(node.min ?? node.getAttribute("min"));
    const max = Number(node.max ?? node.getAttribute("max"));
    const step = Number(node.step ?? node.getAttribute("step"));
    return min === 1 && max === 5 && Math.abs(step - 0.1) <= 1e-9;
}
function stateAriaValid(node, key) {
    const value = node.getAttribute(key);
    return value === null || value === "true" || value === "false";
}
/** Read-only scan: never stores attributes, values, filenames or user content. */
export function auditContinuousControls(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
        throw new TypeError("A mounted tour root is required");
    }
    const failures = new Set();
    const heading = root.querySelector("#lg-cont-title");
    if (!heading || heading.tagName.toUpperCase() !== "H2") {
        failures.add("no-current-heading");
    }
    const ids = new Set();
    const all = Array.from(root.querySelectorAll("*"));
    if (all.length === 0 && root.children) {
        const queue = Array.from(root.children);
        while (queue.length > 0 && all.length <= MAX_NODES) {
            const next = queue.shift();
            if (!next)
                continue;
            all.push(next);
            if (next.children)
                queue.push(...Array.from(next.children));
        }
    }
    if (all.length > MAX_NODES)
        failures.add("control-limit");
    for (const node of all.slice(0, MAX_NODES)) {
        const id = node.id ?? node.getAttribute("id");
        if (id) {
            if (ids.has(id))
                failures.add("duplicate-id");
            ids.add(id);
        }
    }
    for (const node of all.slice(0, MAX_NODES)) {
        for (const attribute of ["aria-controls", "aria-labelledby"]) {
            const references = node.getAttribute(attribute);
            if (references === null)
                continue;
            const ids = references.trim().split(/\s+/).filter(Boolean);
            if (ids.length === 0 || ids.length > 12 || ids.some((id) => !/^[a-z][a-z0-9_-]{0,95}$/i.test(id) || !root.querySelector(`#${id}`))) {
                failures.add("broken-aria-reference");
            }
        }
    }
    for (const canvas of root.querySelectorAll("canvas")) {
        if (!named(canvas))
            failures.add("missing-canvas-description");
    }
    if (Array.from(root.querySelectorAll("main")).length > 1) {
        failures.add("multiple-main-landmarks");
    }
    if (root.querySelector(".lg-continuous")
        && Array.from(root.querySelectorAll('[role="status"]')).length === 0) {
        failures.add("missing-status-region");
    }
    let controlCount = 0;
    let inspected = 0;
    let measuredButtons = 0;
    for (const tag of ["button", "input", "select", "textarea"]) {
        for (const node of root.querySelectorAll(tag)) {
            controlCount += 1;
            if (controlCount > MAX_CONTROLS) {
                failures.add("control-limit");
                continue;
            }
            inspected += 1;
            if (tag === "button" && !named(node))
                failures.add("unnamed-button");
            if (tag !== "button" && !hasNativeLabel(node)) {
                failures.add("unnamed-input");
            }
            if (tag === "input" && node.type === "range") {
                if (!rangeBounds(node))
                    failures.add("missing-slider-range");
                if (isStrength(node) && !checkedStrength(node)) {
                    failures.add("invalid-strength-step");
                }
            }
            if (!stateAriaValid(node, "aria-pressed"))
                failures.add("invalid-pressed-state");
            if (!stateAriaValid(node, "aria-expanded"))
                failures.add("invalid-expanded-state");
            if (tag === "button" && typeof node.getBoundingClientRect === "function") {
                const rect = node.getBoundingClientRect();
                if (Number.isFinite(rect.width) && Number.isFinite(rect.height)
                    && rect.width > 0 && rect.height > 0) {
                    measuredButtons += 1;
                    if (rect.width < 44 || rect.height < 44)
                        failures.add("undersized-button");
                }
            }
        }
    }
    return {
        format: "beljour-tour-accessibility/1",
        controls: Math.min(controlCount, MAX_CONTROLS + 1),
        inspected,
        findings: FINDINGS.filter((finding) => failures.has(finding)),
        measuredButtons,
        note: "local-observation-only",
    };
}
export function auditLabel(observation) {
    if (observation.findings.length > 0) {
        return `Local control check found ${observation.findings.length} rule categories to review. `
            + "No screen-reader or physical-device pass is claimed.";
    }
    return `Checked ${observation.inspected} native controls in this page. `
        + "Screen-reader and physical-device verification remain required.";
}
//# sourceMappingURL=accessibility-audit.js.map