export function navigationIndex(count, index, key) {
    if (!Number.isInteger(count) || count <= 0)
        return null;
    if (!Number.isInteger(index) || index < 0 || index >= count)
        return null;
    if (key === "Home")
        return 0;
    if (key === "End")
        return count - 1;
    if (key === "ArrowRight")
        return (index + 1) % count;
    if (key === "ArrowLeft")
        return (index - 1 + count) % count;
    return null;
}
export function isTypingTarget(target) {
    if (!target || typeof target !== "object")
        return false;
    const element = target;
    const tag = element.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable === true;
}
/** Called only from the nav container. Studio shortcuts keep their own key map. */
export function moveNavFocus(event, items) {
    if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target))
        return false;
    const index = items.findIndex((item) => item === event.target);
    const next = navigationIndex(items.length, index, event.key);
    if (next === null)
        return false;
    event.preventDefault();
    items[next].focus();
    return true;
}
//# sourceMappingURL=keyboard.js.map