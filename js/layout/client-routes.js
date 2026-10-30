/** These destinations are public HTML/URL interfaces, never engine imports.
 * Wording is deliberately about what the destination offers, not a quality claim.
 */
export const CLIENT_LINKS = [
    { id: "home", label: "Home", description: "Start here", href: "home.html",
        group: "main", requirement: "none", page: "home" },
    { id: "studio", label: "Studio", description: "Edit locally with reversible layers",
        href: "studio.html", group: "main", requirement: "none", page: "studio" },
    { id: "classic", label: "Photo lab", description: "Guided photo and try-on steps",
        href: "index.html#/photo", group: "main", requirement: "none", page: "classic", hash: "photo" },
    { id: "looks", label: "My Looks", description: "Saved settings, not stored photos",
        href: "home.html#looks", group: "main", requirement: "none", page: "home", hash: "looks" },
    { id: "trust", label: "Trust", description: "Privacy controls and deletion",
        href: "trust.html", group: "main", requirement: "none", page: "trust" },
    { id: "skin", label: "Skin", description: "Local photo measurements",
        href: "index.html#/skin", group: "local", requirement: "photo", page: "classic", hash: "skin" },
    { id: "shade", label: "Shade", description: "Shade comparison and product matching",
        href: "index.html#/shade", group: "local", requirement: "photo", page: "classic", hash: "shade" },
    { id: "palettes", label: "Palettes", description: "Compare colours",
        href: "index.html#/palettes", group: "local", requirement: "none", page: "classic", hash: "palettes" },
    { id: "shape", label: "Proportions", description: "Measured proportions, not a diagnosis",
        href: "index.html#/proportions", group: "local", requirement: "photo", page: "classic", hash: "proportions" },
    { id: "previews", label: "Previews", description: "On-device appearance simulations",
        href: "index.html#/previews", group: "local", requirement: "photo", page: "classic", hash: "previews" },
    { id: "body", label: "Body", description: "Body photo review",
        href: "index.html#/body", group: "local", requirement: "consent", page: "classic", hash: "body" },
    { id: "hair", label: "Hair styling", description: "Separate approval before cloud styling",
        href: "index.html#/hair", group: "styling", requirement: "consent", page: "classic", hash: "hair" },
    { id: "makeup", label: "Makeup try-on", description: "Separate approval before cloud try-on",
        href: "index.html#/tryon", group: "styling", requirement: "consent", page: "classic", hash: "tryon" },
    { id: "reel", label: "Look reel", description: "Review and compare a look",
        href: "index.html#/reel", group: "styling", requirement: "consent", page: "classic", hash: "reel" },
    { id: "video", label: "Video and live", description: "Local effects on a clip or the camera",
        href: "index.html#/video", group: "local", requirement: "consent", page: "classic", hash: "video" },
    { id: "eyes", label: "Eyes and brows", description: "Local eye and brow simulations",
        href: "eyes-brows.html", group: "local", requirement: "none", page: "other" },
    { id: "enhance", label: "Enhance", description: "Studio lighting and detail controls",
        href: "studio.html#cat=Photo", group: "local", requirement: "none", page: "studio", hash: "cat=Photo" },
    { id: "filters", label: "Filters", description: "Original local colour and light looks",
        href: "studio.html#cat=Filters", group: "local", requirement: "none", page: "studio", hash: "cat=Filters" },
    { id: "privacy", label: "Your data", description: "Photo and history details",
        href: "index.html#/privacy", group: "information", requirement: "none", page: "classic", hash: "privacy" },
];
export const GROUP_TITLES = {
    local: "On-device tools and measurements",
    styling: "Try-on and styling",
    information: "More information",
};
/** URL segments are fixed at authoring time; there is no user-controlled redirect. */
export function destination(id) {
    return CLIENT_LINKS.find((link) => link.id === id) ?? null;
}
export function linksIn(group) {
    return CLIENT_LINKS.filter((link) => link.group === group);
}
export function clientPage(value) {
    if (value === "home" || value === "studio" || value === "trust")
        return value;
    return "classic";
}
export function currentLink(page, hash) {
    if (page === "home")
        return hash === "#looks" ? "looks" : "home";
    if (page === "trust")
        return "trust";
    if (page === "studio")
        return "studio";
    const fragment = hash.startsWith("#/") ? hash.slice(2) : "photo";
    return CLIENT_LINKS.find((link) => link.page === "classic" && link.hash === fragment)?.id ?? "classic";
}
export function isClientLink(href) {
    return CLIENT_LINKS.some((link) => link.href === href);
}
export function availability(link, readiness) {
    if (!readiness || link.requirement === "none")
        return null;
    if (link.requirement === "photo" && !readiness.hasPhoto) {
        return "Open a photo first";
    }
    if (link.requirement === "consent" && !readiness.hasConsent) {
        return "Visit consent required";
    }
    return null;
}
export function validateClientLinks() {
    const problems = [];
    const ids = new Set();
    const hrefs = new Set();
    for (const link of CLIENT_LINKS) {
        if (ids.has(link.id))
            problems.push(`Repeated link id: ${link.id}`);
        if (hrefs.has(link.href))
            problems.push(`Repeated destination: ${link.href}`);
        if (!/^[a-z][a-z-]*$/.test(link.id))
            problems.push(`Invalid link id: ${link.id}`);
        if (!/^[a-z-]+\.html(?:#(?:\/)?[\w=/-]+)?$/.test(link.href)) {
            problems.push(`Unexpected URL form: ${link.id}`);
        }
        if (!link.label.trim() || !link.description.trim())
            problems.push(`Unnamed link: ${link.id}`);
        ids.add(link.id);
        hrefs.add(link.href);
    }
    return problems;
}
//# sourceMappingURL=client-routes.js.map