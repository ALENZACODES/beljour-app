/** Layout v1 top bar: Trust pill on every screen, Save in every tool (layout spec §3 and §5).
 * Pages write the bar in their HTML (so it shows before any script runs); this module wires it
 * and holds the rule both spec tests check: every top bar has a Trust link, and every tool bar
 * (data-tool) also has a Save button.
 * Author: John Khan.
 */
export const TOPBAR_CLASS = "lg-topbar";
export const TRUST_HREF = "trust.html";
/** Every top bar header in an HTML page (class lg-topbar, or a page variant such as
 * lg-topbar-classic), with its inner markup. */
export function topbars(html) {
    const out = [];
    const open = /<header\b([^>]*)>/gi;
    let match;
    while ((match = open.exec(html))) {
        const attrs = match[1];
        const cls = /class\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
        if (!cls.split(/\s+/).some((c) => c.startsWith(TOPBAR_CLASS)))
            continue;
        const end = html.indexOf("</header>", open.lastIndex);
        out.push({ tool: /\bdata-tool\b/i.test(attrs), inner: html.slice(open.lastIndex, end < 0 ? html.length : end) });
    }
    return out;
}
/** Problems with a page's top bars (empty means it follows the rule). */
export function auditTopbars(page, html) {
    const bars = topbars(html);
    const problems = [];
    if (!bars.length)
        problems.push({ page, problem: "no lg-topbar header" });
    for (const bar of bars) {
        const trust = /<a\b[^>]*href="trust\.html[^"]*"[^>]*class="[^"]*\blg-trust-pill\b/i.test(bar.inner)
            || /<a\b[^>]*class="[^"]*\blg-trust-pill\b[^"]*"[^>]*href="trust\.html/i.test(bar.inner);
        if (!trust)
            problems.push({ page, problem: "top bar has no Trust pill linking to trust.html" });
        if (bar.tool && !/<button\b[^>]*\bdata-save\b[^>]*>\s*Save\b/i.test(bar.inner)) {
            problems.push({ page, problem: "tool top bar has no Save button" });
        }
    }
    return problems;
}
/** Wire a Save button in the page's tool bar to an action (the studio's export). */
export function wireSave(root, save) {
    const button = root.querySelector(`header.${TOPBAR_CLASS} [data-save]`);
    button?.addEventListener("click", save);
    return button;
}
