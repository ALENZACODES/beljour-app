import { MODE_INFO, asRGB, composeCells, composeLoupe, composeSplit, differenceMap, splitOrientation } from "./compare.js";
import { layoutCompare, PHONE_CAPTION, DESKTOP_CAPTION } from "./compare-layout.js";
import { CompareSession } from "./compare-session.js";
function pairOf(frames) {
    if (frames.length < 2)
        throw new RangeError("This compare mode needs the original and the edit");
    return [frames[0], frames[1]];
}
export function renderCompare(state, frames, options) {
    const info = MODE_INFO[state.mode];
    if (!frames.length)
        throw new RangeError("No frames to compare");
    const first = frames[0].image;
    const layout = layoutCompare({ mode: state.mode, image: { width: first.width, height: first.height },
        captions: frames.map((f) => f.caption), box: options.box, phone: options.phone, measure: options.measure });
    const session = new CompareSession(state);
    const description = session.describe(options.elapsedMs ?? 0);
    const style = options.phone ? PHONE_CAPTION : DESKTOP_CAPTION;
    const split = splitOrientation(state.mode);
    if (state.mode === "hold" || state.mode === "flicker") {
        const [before, after] = pairOf(frames);
        const showing = session.showing(options.elapsedMs ?? 0) === "before" ? before : after;
        return { image: asRGB(showing.image), layout, captions: [], description, simulation: showing.simulation,
            status: showing === before ? "Showing the original" : `Showing the edit · ${after.count ?? `${after.effective} layer${after.effective === 1 ? "" : "s"}`}` };
    }
    if (split) {
        const [before, after] = pairOf(frames);
        const lineWidth = Math.max(2, Math.round(Math.max(first.width, first.height) / 160));
        return { image: composeSplit(before.image, after.image, split, state.position, { line: lineWidth }), layout, captions: [], description,
            simulation: after.simulation && state.position < 1, status: `Original | edit · line at ${Math.round(state.position * 100)}%` };
    }
    if (state.mode === "difference") {
        const [before, after] = pairOf(frames);
        const { image, stats } = differenceMap(before.image, after.image, { gain: state.differenceGain });
        return { image, layout, captions: [], description, simulation: false, stats,
            status: stats.changed ? `${stats.percent.toFixed(1)}% of pixels changed · largest change ${stats.max} of 255` : "Nothing changed" };
    }
    if (state.mode === "loupe") {
        const [before, after] = pairOf(frames);
        const pane = layout.loupePane ?? 160;
        const centre = [state.loupe.x * (first.width - 1), state.loupe.y * (first.height - 1)];
        const { image } = composeLoupe(before.image, after.image, centre, state.loupe.zoom, pane, { gap: layout.gap, stacked: layout.stacked });
        return { image, layout, captions: [], description, simulation: after.simulation,
            status: `Loupe ${state.loupe.zoom}× · ${layout.stacked ? "original above, edit below" : "original left, edit right"}` };
    }
    // Boards: side by side, 2×2 and the 3×3 stop grid.
    const items = layout.panes.map((pane) => ({ image: frames[pane.frame].image, cell: { x: pane.x, y: pane.y, w: pane.w, h: pane.h } }));
    const { image } = composeCells(layout.width, layout.height, items);
    const captions = layout.panes.filter((p) => p.caption.some(Boolean)).map((p) => ({
        lines: p.caption, x: p.x + p.w / 2, y: p.captionY + style.padding, width: p.w - style.padding * 2,
        lineHeight: style.lineHeight, fontPx: style.fontPx, align: "center"
    }));
    return { image, layout, captions, description, simulation: layout.panes.some((p) => frames[p.frame].simulation),
        status: `${info.title} · ${layout.columns} column${layout.columns === 1 ? "" : "s"}` };
}
//# sourceMappingURL=compare-render.js.map