export function isEditableJudgeTarget(target) {
    if (!target || typeof target !== "object")
        return false;
    const node = target;
    if (node.isContentEditable)
        return true;
    const tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
    return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}
/** No plain arrow/Enter/Space overrides: sliders and screen readers keep native controls. */
export function judgeShortcut(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
        return null;
    if (isEditableJudgeTarget(event.target))
        return null;
    if (event.key === "Escape")
        return "exit";
    if (event.key === "?" || event.key === "F1")
        return "help";
    return null;
}
export function attachJudgeKeys(target, actions) {
    const onKeyDown = (raw) => {
        const event = raw;
        const action = judgeShortcut(event);
        if (!action)
            return;
        event.preventDefault();
        if (action === "exit")
            actions.exit();
        else
            actions.toggleHelp();
    };
    target.addEventListener("keydown", onKeyDown);
    return () => target.removeEventListener("keydown", onKeyDown);
}
/** Update an existing focusable heading without touching the editor or other page landmarks. */
export function focusJudgeHeading(host) {
    const heading = host.querySelector("#lg-judge-title");
    if (!heading)
        return false;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    return true;
}
export function announceJudgeStep(live, stepNumber, total, title) {
    if (!Number.isInteger(stepNumber) || !Number.isInteger(total)
        || total < 1 || stepNumber < 1 || stepNumber > total) {
        throw new RangeError("Invalid step announcement");
    }
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    live.textContent = `Step ${stepNumber} of ${total}: ${title}`;
}
export function prepareJudgeRegion(host, labelId) {
    if (!labelId || !/^[a-z][\w-]*$/i.test(labelId))
        throw new RangeError("Invalid label id");
    host.setAttribute("role", "region");
    host.setAttribute("aria-labelledby", labelId);
    host.setAttribute("aria-roledescription", "guided illustration");
}
