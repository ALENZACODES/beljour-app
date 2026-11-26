/** Public-page navigation only. Every destination exists before this enhancement loads.
 * The classic workflow still enforces readiness at its own routing boundary.
 */
import { CLIENT_LINKS, GROUP_TITLES, availability, currentLink, linksIn, } from "../../layout/client-routes.js";
import { makeDisclosure } from "../../mobile/disclosure.js";
function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
}
function linkNode(doc, link) {
    const anchor = element(doc, "a", "lg-client-link", link.label);
    anchor.href = link.href;
    anchor.dataset.clientLink = link.id;
    anchor.dataset.group = link.group;
    if (link.group !== "main") {
        anchor.className += " lg-client-tool-link";
        const description = element(doc, "span", "lg-client-description", link.description);
        anchor.append(description);
    }
    return anchor;
}
/** No custom click router: browser URLs keep back/forward and open-in-new-tab working. */
export function mountClientNavigation(doc, viewport, page, hash = "") {
    const container = element(doc, "div", "lg-client-navigation");
    const menuToggle = element(doc, "button", "lg-client-menu", "Menu");
    menuToggle.type = "button";
    menuToggle.id = "lg-client-menu-toggle";
    menuToggle.setAttribute("aria-controls", "lg-client-navigation-panel");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
    const nav = element(doc, "nav", "lg-client-navigation-panel");
    nav.id = "lg-client-navigation-panel";
    nav.dataset.open = "false";
    nav.setAttribute("aria-label", "Application sections and features");
    const mainLinks = element(doc, "div", "lg-client-primary");
    const topLinks = linksIn("main").map((link) => linkNode(doc, link));
    mainLinks.append(...topLinks);
    const toolsToggle = element(doc, "button", "lg-client-tools-toggle", "All features");
    toolsToggle.type = "button";
    toolsToggle.id = "lg-client-tools-toggle";
    toolsToggle.setAttribute("aria-controls", "lg-client-tools-panel");
    toolsToggle.setAttribute("aria-expanded", "false");
    const toolPanel = element(doc, "div", "lg-client-tools-panel");
    toolPanel.id = "lg-client-tools-panel";
    toolPanel.dataset.open = "false";
    toolPanel.setAttribute("aria-label", "Available feature screens");
    const allLinks = new Map();
    for (const [index, row] of linksIn("main").entries()) {
        allLinks.set(row.id, topLinks[index]);
    }
    for (const group of ["local", "styling", "information"]) {
        const block = element(doc, "section", "lg-client-feature-group");
        const heading = element(doc, "p", "lg-client-feature-heading", GROUP_TITLES[group]);
        const list = element(doc, "div", "lg-client-feature-list");
        block.setAttribute("aria-label", GROUP_TITLES[group]);
        for (const link of linksIn(group)) {
            const anchor = linkNode(doc, link);
            list.append(anchor);
            allLinks.set(link.id, anchor);
        }
        block.append(heading, list);
        toolPanel.append(block);
    }
    nav.append(mainLinks, toolsToggle, toolPanel);
    container.append(menuToggle, nav);
    const disclosure = makeDisclosure({
        root: container,
        trigger: menuToggle,
        panel: nav,
        toolsButton: toolsToggle,
        toolsPanel: toolPanel,
        topLinks,
    }, doc, viewport);
    const update = (nextPage, nextHash, readiness = null) => {
        const active = currentLink(nextPage, nextHash);
        for (const link of CLIENT_LINKS) {
            const anchor = allLinks.get(link.id);
            if (!anchor)
                continue;
            const selected = link.id === active;
            const highlight = selected || (nextPage === "classic" && link.id === "classic" && active !== "classic");
            anchor.dataset.active = highlight ? "true" : "false";
            if (selected)
                anchor.setAttribute("aria-current", link.id === "looks" ? "location" : "page");
            else
                anchor.removeAttribute("aria-current");
            const note = availability(link, readiness);
            if (note && nextPage === "classic") {
                anchor.dataset.requirement = "pending";
                anchor.dataset.requirementLabel = note;
                anchor.setAttribute("aria-label", `${link.label}. ${note}`);
                anchor.setAttribute("title", note);
            }
            else {
                delete anchor.dataset.requirement;
                delete anchor.dataset.requirementLabel;
                anchor.removeAttribute("aria-label");
                anchor.removeAttribute("title");
            }
        }
        const selectedTool = CLIENT_LINKS.find((link) => link.id === active);
        toolsToggle.dataset.active = selectedTool?.group !== "main" ? "true" : "false";
    };
    update(page, hash);
    return {
        element: container,
        disclosure,
        update,
        destroy() {
            disclosure.destroy();
            container.remove();
        },
    };
}
/** Keep the shell from advertising destinations absent from its own authoring table. */
export function navigationCoverage(groups) {
    const found = new Set(groups);
    return CLIENT_LINKS.filter((item) => !found.has(item.group)).map((item) => item.id);
}
//# sourceMappingURL=client-navigation.js.map