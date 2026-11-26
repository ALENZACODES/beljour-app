export class Announcer {
    sink;
    clock;
    settleMs;
    repeatMs;
    last = "";
    lastAt = -Infinity;
    pending = null;
    timer = null;
    constructor(sink, clock = () => Date.now(), settleMs = 120, repeatMs = 1000) {
        this.sink = sink;
        this.clock = clock;
        this.settleMs = settleMs;
        this.repeatMs = repeatMs;
    }
    say(text, politeness = "polite") {
        const clean = text.replace(/\s+/g, " ").trim().slice(0, 300);
        if (!clean)
            return;
        if (clean === this.last && this.clock() - this.lastAt < this.repeatMs)
            return;
        this.pending = { text: clean, politeness };
        if (politeness === "assertive" || this.settleMs === 0) {
            this.flush();
            return;
        }
        if (this.timer === null)
            this.timer = setTimeout(() => this.flush(), this.settleMs);
    }
    flush() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const item = this.pending;
        this.pending = null;
        if (!item)
            return;
        this.last = item.text;
        this.lastAt = this.clock();
        this.sink(item.text, item.politeness);
    }
}
/** Write to a live region; clearing first makes readers repeat identical later messages. */
export function regionSink(polite, assertive) {
    return (text, politeness) => {
        const region = politeness === "assertive" ? assertive : polite;
        region.textContent = "";
        requestAnimationFrame(() => { region.textContent = text; });
    };
}
//# sourceMappingURL=announcer.js.map