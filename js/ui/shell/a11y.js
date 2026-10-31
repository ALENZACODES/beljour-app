/** Accessibility audit for the studio: page structure, names, references and colour contrast.
 *
 * The same rules run in two places: in Node tests on studio.html and shell.css (through the
 * small HTML reader below), and on the live page with studio.html?audit=1, which audits the
 * DOM as rendered, after the views have built their controls. These checks are a baseline,
 * not a full conformance review; R44 and R55 carry the screen-reader and touch passes.
 *
 * Author: John Khan.
 */
import { contrast, readTokens } from "../contrast.js";
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "template"]);
function node(tag, parent, attrs = {}) {
    return { tag, attrs, children: [], text: "", parent };
}
export function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|times|middot|rarr|larr|harr|minus);/gi, (_, e) => {
        const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", times: "\u00d7", middot: "\u00b7", rarr: "\u2192", larr: "\u2190", harr: "\u2194", minus: "\u2212" };
        const low = e.toLowerCase();
        if (low.startsWith("#x"))
            return String.fromCodePoint(parseInt(low.slice(2), 16));
        if (low.startsWith("#"))
            return String.fromCodePoint(parseInt(low.slice(1), 10));
        return named[low] ?? "";
    });
}
export function parseAttributes(source) {
    const attrs = {};
    const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let m = re.exec(source); m; m = re.exec(source))
        attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    return attrs;
}
/** A forgiving HTML reader for our own static pages: elements, attributes and text. */
export function parseHtml(html) {
    const root = node("#document", null);
    let current = root, i = 0;
    while (i < html.length) {
        if (html.startsWith("<!--", i)) {
            const end = html.indexOf("-->", i + 4);
            i = end < 0 ? html.length : end + 3;
            continue;
        }
        if (html.startsWith("<!", i)) {
            const end = html.indexOf(">", i);
            i = end < 0 ? html.length : end + 1;
            continue;
        }
        if (html[i] === "<" && html[i + 1] === "/") {
            const end = html.indexOf(">", i);
            const tag = html.slice(i + 2, end < 0 ? html.length : end).trim().toLowerCase();
            for (let open = current; open && open !== root; open = open.parent) {
                if (open.tag === tag) {
                    current = open.parent ?? root;
                    break;
                }
            }
            i = end < 0 ? html.length : end + 1;
            continue;
        }
        if (html[i] === "<" && /[a-zA-Z]/.test(html[i + 1] ?? "")) {
            let j = i + 1, quote = "";
            while (j < html.length && (quote || html[j] !== ">")) {
                if (quote) {
                    if (html[j] === quote)
                        quote = "";
                }
                else if (html[j] === '"' || html[j] === "'")
                    quote = html[j];
                j++;
            }
            const inner = html.slice(i + 1, j), selfClosing = inner.endsWith("/");
            const tag = (/^[a-zA-Z0-9-]+/.exec(inner)?.[0] ?? "").toLowerCase();
            const el = node(tag, current, parseAttributes(inner.slice(tag.length).replace(/\/$/, "")));
            current.children.push(el);
            i = j + 1;
            if (RAW.has(tag)) {
                const close = html.toLowerCase().indexOf(`</${tag}`, i);
                el.text = html.slice(i, close < 0 ? html.length : close);
                i = close < 0 ? html.length : html.indexOf(">", close) + 1;
                continue;
            }
            if (!VOID.has(tag) && !selfClosing)
                current = el;
            continue;
        }
        const next = html.indexOf("<", i + 1);
        const chunk = html.slice(i, next < 0 ? html.length : next);
        current.text += decodeEntities(chunk);
        i = next < 0 ? html.length : next;
    }
    return root;
}
/** Adapt a live DOM tree to the audit shape (elements and their direct text). */
export function fromDom(element, parent = null) {
    const attrs = {};
    for (const a of Array.from(element.attributes))
        attrs[a.name.toLowerCase()] = a.value;
    if (element.hidden)
        attrs.hidden = "";
    const out = node(element.tagName.toLowerCase(), parent, attrs);
    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === 3)
            out.text += child.textContent ?? "";
        else if (child.nodeType === 1)
            out.children.push(fromDom(child, out));
    }
    return out;
}
export function walk(root) {
    const out = [];
    const visit = (n) => { out.push(n); n.children.forEach(visit); };
    visit(root);
    return out;
}
export function textOf(n) {
    if (RAW.has(n.tag))
        return "";
    if ("aria-hidden" in n.attrs && n.attrs["aria-hidden"] === "true")
        return "";
    return (n.text + n.children.map(textOf).join(" ")).replace(/\s+/g, " ").trim();
}
function describe(n) {
    const id = n.attrs.id ? `#${n.attrs.id}` : "";
    const cls = n.attrs.class ? `.${n.attrs.class.split(/\s+/)[0]}` : "";
    return `<${n.tag}${id}${cls}>`;
}
function hiddenFromAll(n) {
    for (let p = n; p; p = p.parent)
        if ("hidden" in p.attrs || p.attrs["aria-hidden"] === "true")
            return true;
    return false;
}
/** The accessible name, as far as these rules need it. */
export function accessibleName(n, byId) {
    if (n.attrs["aria-labelledby"]) {
        const names = n.attrs["aria-labelledby"].split(/\s+/).map((id) => byId.get(id)).filter(Boolean).map((x) => textOf(x));
        if (names.join("").trim())
            return names.join(" ").trim();
    }
    if (n.attrs["aria-label"]?.trim())
        return n.attrs["aria-label"].trim();
    if (n.tag === "img")
        return n.attrs.alt ?? "";
    if (["input", "select", "textarea"].includes(n.tag)) {
        if (n.attrs.id) {
            const label = walk(rootOf(n)).find((x) => x.tag === "label" && x.attrs.for === n.attrs.id);
            if (label && textOf(label))
                return textOf(label);
        }
        for (let p = n.parent; p; p = p.parent)
            if (p.tag === "label" && textOf(p))
                return textOf(p);
        return n.attrs.title ?? n.attrs.placeholder ?? "";
    }
    return textOf(n) || n.attrs.title || "";
}
function rootOf(n) { let r = n; while (r.parent)
    r = r.parent; return r; }
const INTERACTIVE = (n) => n.tag === "button" || (n.tag === "a" && "href" in n.attrs) || n.tag === "select" || n.tag === "textarea"
    || (n.tag === "input" && n.attrs.type !== "hidden") || ["button", "tab", "radio", "checkbox", "switch", "slider", "menuitem"].includes(n.attrs.role ?? "");
/** Run the baseline rules over a document or a subtree. */
export function audit(root, options = {}) {
    const issues = [];
    const add = (rule, message, n) => issues.push({ rule, message, where: describe(n) });
    const all = walk(root);
    const byId = new Map();
    for (const n of all) {
        const id = n.attrs.id;
        if (id === undefined)
            continue;
        if (byId.has(id))
            add("unique-ids", `id "${id}" is used more than once`, n);
        byId.set(id, n);
    }
    const html = all.find((n) => n.tag === "html");
    if (html && !html.attrs.lang)
        add("lang", "the page has no language", html);
    const title = all.find((n) => n.tag === "title");
    if (html && (!title || !textOf(title)))
        add("title", "the page has no title", html);
    const mains = all.filter((n) => n.tag === "main" || n.attrs.role === "main");
    if (html && mains.length !== 1)
        add("landmarks", `expected one main region, found ${mains.length}`, html);
    let lastLevel = 0;
    for (const n of all) {
        const m = /^h([1-6])$/.exec(n.tag);
        if (!m || hiddenFromAll(n))
            continue;
        const level = Number(m[1]);
        if (lastLevel && level > lastLevel + 1)
            add("headings", `h${level} follows h${lastLevel}, skipping a level`, n);
        if (!textOf(n))
            add("headings", "a heading is empty", n);
        lastLevel = level;
    }
    if (html && !all.some((n) => n.tag === "h1"))
        add("headings", "the page has no h1", html);
    for (const n of all) {
        for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "for"]) {
            if (!n.attrs[attr] || (attr === "for" && n.tag !== "label" && n.tag !== "output"))
                continue;
            for (const id of n.attrs[attr].split(/\s+/))
                if (id && !byId.has(id))
                    add("references", `${attr} points to a missing id "${id}"`, n);
        }
        const tabindex = Number(n.attrs.tabindex);
        if (Number.isFinite(tabindex) && tabindex > 0)
            add("tabindex", "a positive tabindex breaks the reading order", n);
        if (n.tag === "img" && !("alt" in n.attrs))
            add("images", "an image has no alt text", n);
        if (n.tag === "canvas" && n.attrs["aria-hidden"] !== "true" && !(n.attrs.role === "img" && (n.attrs["aria-label"] || n.attrs["aria-labelledby"]))) {
            add("images", "a canvas needs role=img and a label, or aria-hidden", n);
        }
        if (n.tag === "button" && !n.attrs.type)
            add("button-type", "a button without type acts as a form submit", n);
        if (INTERACTIVE(n) && !hiddenFromAll(n) && !accessibleName(n, byId))
            add("names", "a control has no accessible name", n);
        if (n.attrs.role === "dialog" || n.tag === "dialog") {
            if (!(n.attrs["aria-labelledby"] || n.attrs["aria-label"]))
                add("dialogs", "a dialog has no label", n);
            if (n.attrs.role === "dialog" && n.attrs["aria-modal"] !== "true")
                add("dialogs", "a modal dialog needs aria-modal=true", n);
        }
        if (n.attrs.role === "tablist") {
            const tabs = walk(n).filter((x) => x.attrs.role === "tab");
            if (!tabs.length)
                add("tabs", "a tab list has no tabs", n);
            for (const tab of tabs)
                if (tab.attrs["aria-controls"] && !byId.has(tab.attrs["aria-controls"]))
                    add("tabs", "a tab controls a missing panel", tab);
        }
        if (n.attrs.role === "radiogroup" && !(n.attrs["aria-label"] || n.attrs["aria-labelledby"]))
            add("names", "a radio group has no label", n);
    }
    if (html && !all.some((n) => n.attrs.role === "status" || n.attrs["aria-live"]))
        add("live", "nothing announces status changes", html);
    if (options.requireSkipLink !== false && html) {
        const first = all.find((n) => INTERACTIVE(n));
        const target = first?.attrs.href?.startsWith("#") ? first.attrs.href.slice(1) : "";
        if (!first || first.tag !== "a" || !target || !byId.has(target))
            add("skip-link", "the first control should skip to the editor", first ?? html);
    }
    return issues;
}
/** Flatten a stylesheet's rules, including those inside @media blocks. Comments are dropped. */
export function cssRules(css) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const out = [];
    const read = (body) => {
        let i = 0;
        while (i < body.length) {
            const open = body.indexOf("{", i);
            if (open < 0)
                break;
            const head = body.slice(i, open).trim();
            let depth = 1, j = open + 1;
            while (j < body.length && depth) {
                if (body[j] === "{")
                    depth++;
                else if (body[j] === "}")
                    depth--;
                j++;
            }
            const inner = body.slice(open + 1, j - 1);
            if (head.startsWith("@")) {
                if (/^@media|^@supports/.test(head))
                    read(inner);
            }
            else {
                const declarations = {};
                for (const part of inner.split(";")) {
                    const colon = part.indexOf(":");
                    if (colon > 0)
                        declarations[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim();
                }
                for (const selector of head.split(","))
                    out.push({ selector: selector.trim(), declarations });
            }
            i = j;
        }
    };
    read(text);
    return out;
}
/** The first solid colour in a value, with var(--token) resolved from the theme. */
export function solidColour(value, tokens) {
    if (!value)
        return null;
    const resolved = value.replace(/var\(--([a-z0-9-]+)\)/gi, (_, name) => tokens[name] ?? "");
    const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(resolved);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
        return `#${h.toUpperCase()}`;
    }
    if (/\bwhite\b/i.test(resolved))
        return "#FFFFFF";
    if (/\bblack\b/i.test(resolved))
        return "#000000";
    return null;
}
/** Every text colour paired with its own background, or with the backgrounds it can sit on. */
export function contrastRows(css, tokens, surfacesFor) {
    const rows = [];
    for (const rule of cssRules(css)) {
        if (/:disabled|::placeholder|\[disabled\]/.test(rule.selector))
            continue;
        const fg = solidColour(rule.declarations.color, tokens);
        if (!fg)
            continue;
        const own = solidColour(rule.declarations["background-color"] ?? rule.declarations.background, tokens);
        const sizes = /(\d+(?:\.\d+)?)px/.exec(rule.declarations["font-size"] ?? rule.declarations.font ?? "");
        const weight = /\b([6-9]\d\d|bold)\b/.test(`${rule.declarations["font-weight"] ?? ""} ${rule.declarations.font ?? ""}`);
        const px = sizes ? Number(sizes[1]) : 14;
        const large = px >= 24 || (px >= 18.66 && weight);
        const needed = large ? 3 : 4.5;
        for (const bg of own ? [own] : surfacesFor(rule.selector))
            rows.push({ selector: rule.selector, fg, bg, ratio: contrast(fg, bg), needed });
    }
    return rows;
}
export function contrastFailures(rows) {
    return rows.filter((r) => r.ratio + 1e-9 < r.needed);
}
export { readTokens };
