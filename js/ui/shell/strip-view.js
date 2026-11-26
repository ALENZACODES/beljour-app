/** FS7 strip and pre-check list on the studio page (DOM). Rendering happens in the shell worker;
 * this file only places the results. Author: John Khan.
 */
import { toRGBA } from "../../engines/core/buffer.js";
import { roving } from "./focus.js";
import { summarise } from "./precheck.js";
import { STRIP_PAGE, THUMB_BUDGET_MS, StripCache, activeOption, annotateEnhancePreviews, planStrip } from "./thumbnails.js";
function el(tag, className = "", text) {
    const n = document.createElement(tag);
    if (className)
        n.className = className;
    if (text !== undefined)
        n.textContent = text;
    return n;
}
export class StripView {
    container;
    note;
    hooks;
    ticket = 0;
    cache = new StripCache();
    release = null;
    last = null;
    context = null;
    constructor(container, note, hooks) {
        this.container = container;
        this.note = note;
        this.hooks = hooks;
    }
    /** Show the strip for this tool and photo; renders in the worker unless cached. */
    show(studio, source, selected) {
        const ticket = ++this.ticket;
        this.context = { studio, source, next: null, total: 0 };
        const cached = this.cache.get(source, studio);
        if (cached) {
            this.render(cached, selected);
            return;
        }
        const plan = planStrip(studio, source);
        this.render(plan.slice(0, STRIP_PAGE), selected, true);
        if (!plan.some((t) => t.option))
            return;
        this.note.textContent = "Rendering previews on this device…";
        this.hooks.client.thumbnails(source, studio).then((strip) => {
            if (ticket !== this.ticket)
                return;
            this.context = { studio, source, next: strip.more ? strip.page + 1 : null, total: strip.total };
            if (!strip.more)
                this.cache.set(source, studio, strip.tiles);
            this.render(strip.tiles, selected);
        }, (error) => {
            if (ticket !== this.ticket)
                return;
            const message = error instanceof Error ? error.message : String(error);
            this.context = { studio, source, next: plan.length > STRIP_PAGE ? 1 : null, total: plan.length };
            // Tiles stay tappable (r1 disabled every one, so a failed page offered nothing to pick).
            this.render(plan.slice(0, STRIP_PAGE).map((tile) => (tile.option ? { ...tile, status: "unrendered", reason: message } : tile)), selected);
            this.note.textContent = `Preview images unavailable: ${message}. You can still tap any option.`;
        });
    }
    /** Load the next ranked page and add it to the strip (large catalogues). */
    more(selected) {
        const ctx = this.context, shown = this.last?.tiles ?? [];
        if (!ctx || ctx.next === null)
            return;
        const ticket = ++this.ticket, page = ctx.next;
        this.note.textContent = `Rendering page ${page + 1} of previews on this device…`;
        this.hooks.client.thumbnails(ctx.source, ctx.studio, { page }).then((strip) => {
            if (ticket !== this.ticket)
                return;
            ctx.next = strip.more ? strip.page + 1 : null;
            const all = [...shown, ...strip.tiles];
            if (!strip.more)
                this.cache.set(ctx.source, ctx.studio, all);
            this.render(all, selected);
            (this.container.querySelectorAll(".shell-thumb")[shown.length])?.focus();
        }, (error) => {
            if (ticket !== this.ticket)
                return;
            const message = error instanceof Error ? error.message : String(error);
            const plan = planStrip(ctx.studio, ctx.source);
            const fallback = plan.slice(page * STRIP_PAGE, (page + 1) * STRIP_PAGE).map((tile) => (tile.option ? { ...tile, status: "unrendered", reason: message } : tile));
            ctx.next = (page + 1) * STRIP_PAGE < plan.length ? page + 1 : null;
            this.render([...shown, ...fallback], selected);
            this.note.textContent = `Some previews unavailable: ${message}. You can still tap any option.`;
        });
    }
    /** Re-mark the active tile after an edit, without re-rendering pictures. */
    select(selected) {
        if (this.last)
            this.render(this.last.tiles, selected);
    }
    clear() { this.cache.clear(); }
    render(tiles, selected, pending = false) {
        this.release?.();
        this.release = null;
        this.container.replaceChildren();
        this.last = pending ? null : { tiles: [...tiles], selected };
        const active = activeOption(tiles, selected);
        const real = annotateEnhancePreviews(tiles.filter((t) => t.option));
        if (!real.length) {
            const tile = tiles[0];
            const p = el("p", "shell-strip-empty", tile?.reason ?? "No previews for this tool.");
            this.container.append(p);
            this.note.textContent = "Free, on this device";
            return;
        }
        let slow = 0, total = 0;
        for (const tile of real) {
            const b = el("button", "shell-thumb");
            b.type = "button";
            b.setAttribute("aria-pressed", String(tile.option.id === active));
            b.dataset.option = tile.option.id;
            const frame = el("span", "shell-thumb-frame");
            if (tile.image) {
                const c = el("canvas", "shell-thumb-canvas");
                c.width = tile.image.width;
                c.height = tile.image.height;
                c.setAttribute("aria-hidden", "true");
                c.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(toRGBA(tile.image)), tile.image.width, tile.image.height), 0, 0);
                frame.append(c);
            }
            else
                frame.append(el("span", "shell-thumb-wait", pending ? "…" : "–"));
            b.append(frame, el("span", "shell-thumb-label", tile.label));
            if (tile.note)
                b.append(el("span", "shell-thumb-note", tile.note));
            if (tile.status === "blocked") {
                b.disabled = true;
                b.title = tile.reason ?? "Not available";
            }
            else if (tile.status === "unrendered")
                b.title = `${tile.reason ?? "Preview unavailable."} Tap to use ${tile.label}.`;
            else
                b.title = `Use ${tile.label}${tile.simulation ? " (simulation)" : ""}${tile.note ? `. ${tile.note}` : ""}`;
            if (tile.ms !== undefined) {
                total += tile.ms;
                if (tile.overBudget)
                    slow++;
            }
            b.addEventListener("click", () => this.hooks.pick(tile));
            this.container.append(b);
        }
        if (!pending && this.context && this.context.next !== null) {
            const left = Math.max(0, this.context.total - real.length);
            const more = el("button", "shell-button shell-thumb-more", `Show ${Math.min(STRIP_PAGE, left)} more`);
            more.type = "button";
            more.setAttribute("aria-label", `Show ${Math.min(STRIP_PAGE, left)} more previews, ${left} not shown yet`);
            more.addEventListener("click", () => this.more(selected));
            this.container.append(more);
        }
        this.release = roving(this.container, ".shell-thumb", "horizontal");
        // The timing is for developers (shown with studio.html?dev=1); everyone sees where it ran.
        if (pending)
            this.note.textContent = "Rendering previews on this device…";
        else {
            const timing = this.note.ownerDocument.createElement("span");
            timing.className = "shell-dev-timing";
            timing.textContent = ` · ${Math.round(total)} ms for ${real.length}${slow ? ` · ${slow} over the ${THUMB_BUDGET_MS} ms target` : ""}`;
            this.note.replaceChildren("Free, on this device", timing);
        }
    }
}
const ICON = { pass: "✓", warn: "!", block: "×" };
const SPOKEN = { pass: "Passed: ", warn: "Check: ", block: "Can't use: " };
/** Fill the pre-check panel. Warnings open it; a clean report stays folded. */
export function renderPrecheck(details, summary, list, report) {
    details.hidden = false;
    details.dataset.verdict = report.verdict;
    const line = summarise(report);
    summary.textContent = line;
    list.replaceChildren();
    for (const check of report.checks) {
        const li = el("li", "shell-check-item");
        li.dataset.level = check.level;
        const icon = el("span", "shell-check-icon", ICON[check.level]);
        icon.setAttribute("aria-hidden", "true");
        const spoken = el("span", "shell-visually-hidden", SPOKEN[check.level]);
        const text = el("span", "shell-check-text");
        text.append(spoken, el("strong", "", `${check.title}. `), check.message);
        li.append(icon, text);
        list.append(li);
    }
    // Folded unless the photo can't be used; the summary line already says what to look at.
    details.open = report.verdict === "blocked";
    return line;
}
//# sourceMappingURL=strip-view.js.map