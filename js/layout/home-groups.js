/** Home feature groups on a phone: every group is a <details> that the page ships open (so it
 * works without JavaScript and on a desktop); on a narrow screen all but the first are closed,
 * so the hub is a short list of groups to open rather than one long scroll. A jump link or a
 * #group-… / #feature-… address opens the group it points into. Author: John Khan.
 */
export const PHONE = "(max-width: 759px)";
/** Open the group that holds the element with this id (a group or a feature card). */
export function openFor(doc, id) {
    const target = id ? doc.getElementById(id) : null;
    const group = target?.closest("details.hub-group");
    if (group)
        group.open = true;
}
export function mountHomeGroups(doc = document, win = window) {
    const groups = [...doc.querySelectorAll("details.hub-group")];
    if (!groups.length)
        return;
    if (win.matchMedia?.(PHONE).matches)
        groups.forEach((g, i) => { g.open = i === 0; });
    const fromHash = () => openFor(doc, decodeURIComponent(win.location.hash.replace(/^#/, "")));
    fromHash();
    win.addEventListener("hashchange", fromHash);
}
