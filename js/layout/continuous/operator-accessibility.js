/** Structural DOM audit only, never a claim of screen-reader certification. */
import { OPERATOR_ROUTE_IDS, isSafeOperatorHref } from "./operator-contract.js";
function textName(node) {
    return (node.getAttribute("aria-label") || node.textContent || "").trim();
}
function targetTooSmall(node) {
    const rect = node.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height))
        return true;
    if (rect.width <= 0 || rect.height <= 0)
        return false;
    return rect.width < 44 || rect.height < 44;
}
/** Reports numerical UI issues; it never inspects filenames, photos or form values. */
export function inspectOperatorControls(root) {
    const section = root.querySelector("#lg-cont-operator");
    if (!section) {
        return {
            kind: "beljour-operator-accessibility/1",
            links: 0, buttons: 0, duplicateActions: [], missingNames: 0,
            unsafeLinks: 0, smallTargets: 0, checked: false,
            browserCertified: false, screenReaderCertified: false,
        };
    }
    const anchors = Array.from(section.querySelectorAll("a"));
    const buttons = Array.from(section.querySelectorAll("button"));
    const seen = new Set();
    const repeats = [];
    let missingNames = 0;
    let unsafeLinks = 0;
    let smallTargets = 0;
    for (const element of [...anchors, ...buttons]) {
        const action = element.dataset.tourAction ?? "";
        if (!action || !textName(element))
            missingNames += 1;
        if (action && seen.has(action))
            repeats.push(action);
        seen.add(action);
        if (targetTooSmall(element))
            smallTargets += 1;
    }
    const visited = new Set();
    for (const anchor of anchors) {
        const action = anchor.dataset.tourAction ?? "";
        const id = action.startsWith("operator-open-") ? action.slice("operator-open-".length) : "";
        if (!OPERATOR_ROUTE_IDS.some((known) => known === id) || visited.has(id))
            unsafeLinks += 1;
        visited.add(id);
        const raw = anchor.getAttribute("href") || anchor.href;
        if (!isSafeOperatorHref(raw))
            unsafeLinks += 1;
        if (anchor.target !== "_blank" || anchor.rel !== "noopener noreferrer")
            unsafeLinks += 1;
    }
    if (anchors.length !== OPERATOR_ROUTE_IDS.length)
        unsafeLinks += 1;
    return Object.freeze({
        kind: "beljour-operator-accessibility/1",
        links: anchors.length,
        buttons: buttons.length,
        duplicateActions: Object.freeze(repeats),
        missingNames,
        unsafeLinks,
        smallTargets,
        checked: true,
        browserCertified: false,
        screenReaderCertified: false,
    });
}
export function operatorA11yCaption(result) {
    if (!result.checked)
        return "Manual operator controls were not inspected.";
    const issues = result.duplicateActions.length + result.missingNames
        + result.unsafeLinks + result.smallTargets;
    return `${result.links} public links and ${result.buttons} controls inspected; `
        + `${issues} structural issue(s). Physical-device and screen-reader reviews remain required.`;
}
