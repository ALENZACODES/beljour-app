export const STEPS = [
    { route: "photo", label: "Photo" },
    { route: "skin", label: "Skin" },
    { route: "shade", label: "Shade" },
    { route: "palettes", label: "Palettes" },
    { route: "hair", label: "Hair" },
    { route: "tryon", label: "Makeup" },
    { route: "proportions", label: "Proportions" },
    { route: "previews", label: "Previews" },
    { route: "body", label: "Body" },
    { route: "reel", label: "Reel" },
    { route: "video", label: "Video" },
];
export function releaseLocalPhoto(ctx) {
    ctx.localPhoto?.release();
    ctx.localPhoto = null;
}
/** Shared by routing and navigation labels. Local screens need local pixels;
 * provider screens need the separately prepared server photo. */
export function routeReady(ctx, route) {
    // Body, Reel and Video ask the single consent themselves when a photo, clip or camera is opened.
    if (["photo", "privacy", "palettes", "body", "reel", "video"].includes(route))
        return true;
    if (["skin", "shade", "proportions", "previews"].includes(route))
        return !!ctx.photoSrc;
    return ctx.consent && !!ctx.photo;
}
export function requirePhoto(ctx) {
    if (ctx.photo)
        return true;
    ctx.go("photo");
    return false;
}
/** Landmarks as [[x, y], ...] for the server. */
export function landmarkArray(ctx) {
    return ctx.face ? ctx.face.points.map((p) => [p.x, p.y]) : undefined;
}
//# sourceMappingURL=ctx.js.map