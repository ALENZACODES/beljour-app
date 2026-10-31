/** Six-tile five-strength board: the original plus the five actual previews.
 * Session state decides which board is current: any slider, photo, settings, brush or
 * head revision clears the board and its download, and a late result or error from an
 * older run can never overwrite a newer status. The PNG export draws the whole board
 * with a local-simulation label and only runs when the user asks for it.
 * No uploads, persistence or provider calls. Author: John Khan.
 */
import { BOARD_LABEL } from "./level-board.js";
import { PALETTE } from "../ui/palette.js";
export const TILE_GAP = 6;
export const LABEL_BAND = 28;
export const CAPTION_BAND = 22;
export const EXPORT_NAME = "beljour-five-strength-simulation.png";
export function tileCaption(evidence) {
    if (!evidence)
        return "Original photo";
    const level = `Strength ${evidence.level.toFixed(1)}`;
    if (evidence.status === "refused")
        return `${level} · refused: ${evidence.refusal_code}`;
    if (evidence.status === "unchanged")
        return `${level} · unchanged`;
    return `${level} · ${evidence.changed_pixels} pixels changed`;
}
/** Three columns by two rows below a label band; each tile keeps the photo size. */
export function boardLayout(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw RangeError("Board tiles need a positive integer size.");
    }
    const tiles = [];
    for (let index = 0; index < 6; index++) {
        const column = index % 3, row = Math.floor(index / 3);
        const x = TILE_GAP + column * (width + TILE_GAP);
        const y = LABEL_BAND + row * (height + CAPTION_BAND + TILE_GAP);
        tiles.push({ x, y, width, height, captionY: y + height + CAPTION_BAND - 7 });
    }
    return { width: 3 * width + 4 * TILE_GAP, height: LABEL_BAND + 2 * (height + CAPTION_BAND + TILE_GAP), tiles };
}
/** Place the original and the five tiles on a white RGBA canvas buffer. */
export function composeBoard(board) {
    if (board.tiles.length !== 5)
        throw RangeError("A board has exactly five tiles.");
    const layout = boardLayout(board.width, board.height);
    const data = new Uint8ClampedArray(layout.width * layout.height * 4).fill(255);
    const sources = [board.original, ...board.tiles.map((tile) => tile.pixels)];
    sources.forEach((pixels, index) => {
        if (pixels.length !== board.width * board.height * board.channels)
            throw RangeError("Tile size mismatch.");
        const rect = layout.tiles[index];
        for (let y = 0; y < board.height; y++)
            for (let x = 0; x < board.width; x++) {
                const from = (y * board.width + x) * board.channels;
                const to = ((rect.y + y) * layout.width + rect.x + x) * 4;
                data[to] = pixels[from];
                data[to + 1] = pixels[from + 1];
                data[to + 2] = pixels[from + 2];
                data[to + 3] = board.channels === 4 ? pixels[from + 3] : 255;
            }
    });
    return { width: layout.width, height: layout.height, data, layout };
}
function cancelled(error) {
    return error instanceof Error && error.name === "AbortError";
}
/** Which board run is current; stale results and errors are dropped. */
export class BoardSession {
    generation = 0;
    started = false;
    controller = null;
    current = null;
    status = "No five-strength board yet. Mark the photo, then ask for a review.";
    get board() { return this.current; }
    get exportable() { return this.current !== null; }
    invalidate(reason) {
        this.generation++;
        this.controller?.abort();
        this.controller = null;
        if (this.current || this.started)
            this.status = `Board cleared because the ${reason} changed.`;
        this.current = null;
    }
    start() {
        this.controller?.abort();
        this.controller = new AbortController();
        this.current = null;
        this.started = true;
        this.status = "Rendering five strengths on this device.";
        return { ticket: ++this.generation, signal: this.controller.signal };
    }
    live(ticket) {
        return ticket === this.generation;
    }
    finish(ticket, board) {
        if (!this.live(ticket))
            return false;
        this.current = board;
        this.controller = null;
        const counts = board.tiles.reduce((sum, tile) => ({ ...sum, [tile.evidence.status]: (sum[tile.evidence.status] ?? 0) + 1 }), {});
        this.status = `Five strengths: ${counts.rendered ?? 0} rendered, ${counts.unchanged ?? 0} unchanged, ` +
            `${counts.refused ?? 0} refused. ${BOARD_LABEL}`;
        return true;
    }
    fail(ticket, error) {
        if (!this.live(ticket) || cancelled(error))
            return false;
        this.controller = null;
        this.current = null;
        this.status = error instanceof Error ? error.message : "Unable to build the five-strength board.";
        return true;
    }
    /** The board to export, only when the user asked and the board is still current. */
    exportRequest() { return this.current; }
}
/** DOM wrapper: draws the composed board and labels; export is a separate user action. */
export class FiveStrengthBoardView {
    session;
    root = document.createElement("section");
    canvas = document.createElement("canvas");
    status = document.createElement("p");
    download = document.createElement("button");
    constructor(host, session) {
        this.session = session;
        this.root.className = "commerce-panel five-strength-board";
        this.root.setAttribute("aria-label", "Five strength local simulation board");
        this.status.setAttribute("role", "status");
        this.status.setAttribute("aria-live", "polite");
        this.canvas.style.maxWidth = "100%";
        this.canvas.style.height = "auto";
        this.download.type = "button";
        this.download.textContent = "Save the five-strength board as a labelled PNG";
        this.download.disabled = true;
        this.download.addEventListener("click", () => this.exportPng());
        this.root.append(this.canvas, this.status, this.download);
        host.append(this.root);
        this.refresh();
    }
    refresh() {
        this.status.textContent = this.session.status;
        const board = this.session.board;
        this.download.disabled = !board;
        if (!board) {
            this.canvas.width = 0;
            this.canvas.height = 0;
            return;
        }
        const raster = composeBoard(board);
        this.canvas.width = raster.width;
        this.canvas.height = raster.height;
        const ctx = this.canvas.getContext("2d");
        if (!ctx)
            throw Error("Canvas preview is unavailable.");
        ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
        ctx.fillStyle = PALETTE.plum; // saved with the board: fixed light palette
        ctx.font = "13px sans-serif";
        ctx.fillText(BOARD_LABEL, TILE_GAP, 18, raster.width - 2 * TILE_GAP);
        raster.layout.tiles.forEach((rect, index) => {
            ctx.fillText(tileCaption(index ? board.tiles[index - 1].evidence : null), rect.x, rect.captionY, rect.width);
        });
    }
    exportPng() {
        if (!this.session.exportRequest())
            return;
        this.canvas.toBlob((blob) => {
            if (!blob || !this.session.exportRequest())
                return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = EXPORT_NAME;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        }, "image/png");
    }
}
