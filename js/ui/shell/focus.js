/** Focus helpers: roving tabindex for toolbars and tab lists, and a focus trap for dialogs.
 *
 * The index arithmetic is pure (tested in Node); the small DOM helpers below apply it.
 * Roving tabindex means a group is one Tab stop and the arrow keys move inside it, as the
 * WAI-ARIA authoring practices describe for toolbars, radio groups and tabs.
 *
 * Author: John Khan.
 */
/** The item index after a key press, or null when the key isn't for this group. */
export function rovingIndex(count, current, key, orientation = "horizontal", wrap = true) {
    if (!(Number.isInteger(count) && count >= 1))
        return null;
    const at = Math.min(count - 1, Math.max(0, Number.isInteger(current) ? current : 0));
    const back = orientation === "vertical" ? ["ArrowUp"] : orientation === "horizontal" ? ["ArrowLeft"] : ["ArrowLeft", "ArrowUp"];
    const forward = orientation === "vertical" ? ["ArrowDown"] : orientation === "horizontal" ? ["ArrowRight"] : ["ArrowRight", "ArrowDown"];
    if (key === "Home")
        return 0;
    if (key === "End")
        return count - 1;
    if (back.includes(key))
        return at > 0 ? at - 1 : wrap ? count - 1 : 0;
    if (forward.includes(key))
        return at < count - 1 ? at + 1 : wrap ? 0 : count - 1;
    return null;
}
/** Where Tab (or Shift+Tab) goes inside a trapped dialog. */
export function trapIndex(count, current, backwards) {
    if (!(Number.isInteger(count) && count >= 1))
        throw new RangeError("A dialog needs at least one focusable control");
    if (current < 0 || current >= count)
        return backwards ? count - 1 : 0;
    return backwards ? (current === 0 ? count - 1 : current - 1) : (current === count - 1 ? 0 : current + 1);
}
export const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
export function focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && !el.closest("[hidden], [inert]") && el.getClientRects().length > 0);
}
/** Make a container's items one Tab stop; arrows move focus and call `activate` if given. */
export function roving(container, selector, orientation, activate) {
    const items = () => [...container.querySelectorAll(selector)].filter((el) => !el.disabled);
    const sync = (active) => items().forEach((el, i) => { el.tabIndex = i === active ? 0 : -1; });
    const current = items().findIndex((el) => el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true");
    sync(current < 0 ? 0 : current);
    const onKey = (event) => {
        const list = items(), at = list.indexOf(event.target);
        if (at < 0)
            return;
        const next = rovingIndex(list.length, at, event.key, orientation);
        if (next === null)
            return;
        event.preventDefault();
        sync(next);
        list[next].focus();
        activate?.(list[next], next);
    };
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
}
/** Keep Tab inside `dialog`. Returns a function that releases the trap. */
export function trap(dialog) {
    const onKey = (event) => {
        if (event.key !== "Tab")
            return;
        const list = focusables(dialog);
        if (!list.length) {
            event.preventDefault();
            return;
        }
        const next = trapIndex(list.length, list.indexOf(document.activeElement), event.shiftKey);
        event.preventDefault();
        list[next].focus();
    };
    dialog.addEventListener("keydown", onKey);
    return () => dialog.removeEventListener("keydown", onKey);
}
//# sourceMappingURL=focus.js.map