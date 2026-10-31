export const CATALOGUE = [
    { id: "enhance", title: "Enhance", description: "Auto fix in one tap: white balance, light, contrast, noise and colour, worked out on this device. Rescue modes for dark, blurry or faded photos.",
        category: "Local studio", source: "local", sample: "low-light",
        safety: "Local enhancement on this photo; no detail is invented.", shortcut: "E" },
    { id: "hair-fibre", title: "Hair fibres", description: "Crown coverage, fibre strands, spray or powder on an outlined crown.",
        category: "Local studio", source: "local", sample: "crown",
        safety: "Hair fibre simulation. A photo-based estimate, not a diagnosis.", shortcut: "F" },
    { id: "beard", title: "Beard", description: "Drawn strands with adjustable length, density, edge and colour.",
        category: "Local studio", source: "local", sample: "portrait",
        safety: "Beard simulation on this photo.", shortcut: "B" },
    { id: "posture", title: "Posture edit", description: "Guarded body warp and background fill, with manual body points.",
        category: "Local studio", source: "local", sample: "body-front",
        safety: "Photo edit. Not a posture assessment and not medical advice.", shortcut: "P" },
    { id: "face-makeup", title: "Makeup", description: "Lipstick (matte, satin or gloss), blush, eyeshadow and eyeliner, drawn on this device from your face points. Lip lines and skin texture stay.",
        category: "Local studio", source: "local", sample: "portrait",
        safety: "Makeup simulation on this device; your photo is not sent anywhere. Preview, not a promise.", shortcut: "" },
    { id: "makeup", title: "Makeup try-on (YouCam)", description: "Makeup previews use the approved YouCam task gateway after a quote and click.",
        category: "YouCam styling", source: "youcam", sample: "portrait",
        safety: "Sent to YouCam, deleted after the result. Preview, not a promise.", shortcut: "M" },
    { id: "hair-style", title: "Hair Studio", description: "347 haircut ideas to browse offline, one synthetic example, reference rights, pose guard and variant planning. Real requests use the existing YouCam styling gateway.",
        category: "YouCam styling", source: "youcam", sample: "portrait",
        safety: "Catalogue and illustrated replay stay on this device. Only an expressly consented styling request may reach YouCam.", shortcut: "H" },
    { id: "filters", title: "Filters", description: "Colour and light looks, most loved first. One tap, a 0-100 slider, gentle by default.",
        category: "Local studio", source: "local", sample: "portrait",
        safety: "On this device. With the skin guard on, a look never lightens your skin or turns its hue.", shortcut: "L" },
    { id: "portrait", title: "Portrait looks", description: "Named one-tap looks: texture-kept skin polish, gentle eye, brow and lip definition and a colour grade, on one slider.",
        category: "Local studio", source: "local", sample: "portrait",
        safety: "Local simulation on this device. Never lightens your skin; pores, freckles and moles stay. Not medical advice.", shortcut: "" },
    { id: "older", title: "Older", description: "Five local appearance stops, with lines, texture and guarded shape changes.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Local simulation. Not an age prediction; real-face quality is not yet validated.", shortcut: "" },
    { id: "younger", title: "Younger", description: "Three local appearance stops, with skin texture retained and guarded shape changes.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Local simulation. Does not infer or predict age.", shortcut: "" },
    { id: "gender", title: "Gender appearance", description: "Seven masculine and feminine appearance stops using the existing guarded face mesh engine.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Local simulation, face only. Not a measure of identity or sex. Real-face quality is not yet validated.", shortcut: "" },
    { id: "lighting", title: "Lighting", description: "See this look in Daylight, Office or Evening light, with the measured colour shift.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Local simulation. Your screen is not colour-calibrated.", shortcut: "" },
    { id: "recolour", title: "Curl-preserving recolour", description: "Choose a colour inside the hair you marked. The strand and curl positions stay fixed.",
        category: "Local studio", source: "local", sample: "crown", safety: "Local simulation. No straightening or new hair is generated.", shortcut: "" },
    { id: "balayage", title: "Balayage painter", description: "Paint the placement, choose colour history and preview the estimated first session.",
        category: "Local studio", source: "local", sample: "crown", safety: "Local simulation. Lift limits are estimates; a colourist and strand test decide the real result.", shortcut: "" },
    { id: "skin", title: "Skin", description: "Smooth, Foundation, Freckles, Tan, Matte, Glow and Even tone on the skin your face points outline, up to the hairline. Pores, freckles and moles stay.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Local simulation, not medical advice. Only tan removal lightens skin, and only when you turn it on.", shortcut: "" },
    { id: "under-eye", title: "Under-eye", description: "Dark circles and eye-bag shadow brought toward your own cheek colour, never past it. Marks and texture stay.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Local simulation, not medical advice. It never lightens past your own cheek.", shortcut: "" },
    { id: "teeth", title: "Teeth whitening", description: "Visible teeth a few shades lighter with a natural cap: never paper white, never blue. Gaps, gums, tongue and lips stay.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Optical colour simulation on this device, not dental treatment or a whitening prediction.", shortcut: "" },
    { id: "shave", title: "Beard removal", description: "Stubble or a short beard taken back to the skin beside it. A full beard that hides the jaw is not removed.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Clean-shave visual estimate on this device. Skin under the hair is estimated from nearby skin, not invented.", shortcut: "" },
    { id: "grey", title: "Grey Transition", description: "See your greys covered in your natural shade, blended, or your hair fully silver, inside the hair you mark.",
        category: "Local studio", source: "local", sample: "crown", safety: "Colour simulation and salon-decision aid on this device, not a salon result. No age is asked or inferred.", shortcut: "" },
    { id: "studio", title: "Photo studio", description: "Background blur, drawn backdrops, relight, a headshot studio and authenticity mode, from your person area. Your own pixels stay yours.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Edited photo, not generated: no new face, clothes or place is made. Relight keeps your face's average brightness.", shortcut: "" },
    { id: "illustration", title: "Illustration", description: "Cartoon, comic, watercolour wash and painted portrait looks drawn from your own photo. Your face shape is unchanged.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Illustration filter on your own photo; no costume, face or background is generated.", shortcut: "" },
    // Photo adjustment and crop (web/src/editor): photo edits on any photo, no face points needed.
    { id: "adjust", title: "Adjust", description: "Exposure, brilliance, highlights, shadows, contrast, black and white point, temperature, tint, saturation, vibrance, clarity, sharpen, noise reduction, vignette, grain and fade, each with its own reset.",
        category: "Adjust and crop", source: "local", sample: "portrait",
        safety: "Photo edit on this device. Every slider starts at no change; vibrance and clarity go easy on skin.", shortcut: "A" },
    { id: "mixer", title: "Colour mixer", description: "Hue, saturation and luminance for eight colours. Skin-tone protection is on unless you turn it off.",
        category: "Adjust and crop", source: "local", sample: "portrait",
        safety: "Photo edit on this device. With skin protection on, skin tones keep their colour.", shortcut: "X" },
    { id: "curves", title: "Curves", description: "An RGB curve and red, green and blue curves with points you drag, and named starting points.",
        category: "Adjust and crop", source: "local", sample: "portrait",
        safety: "Photo edit on this device. Curves never invert the picture.", shortcut: "U" },
    { id: "selective", title: "Selective adjust", description: "Tap a point or paint an area, then change exposure, contrast, saturation or warmth there only.",
        category: "Adjust and crop", source: "local", sample: "portrait",
        safety: "Photo edit on this device, only where you place it.", shortcut: "S" },
    { id: "crop", title: "Crop and straighten", description: "Free or fixed ratios, quarter turns, flips, straighten with a grid and keystone fixes. Saved at full size.",
        category: "Adjust and crop", source: "local", sample: "portrait",
        safety: "Photo edit on this device. The original stays whole; the crop is a layer you can undo.", shortcut: "C" },
    { id: "retouch", title: "Retouch brushes", description: "Paint exactly where: heal, smooth, whiten, details, relight, blur, colour and reshape, with your finger, pen or mouse.",
        category: "Local studio", source: "local", sample: "portrait", safety: "Only what you paint changes. Face-changing brushes are labelled simulations; nothing lightens your skin unless you choose dodge. Not medical advice.", shortcut: "" },
];
const byId = new Map(CATALOGUE.map((tool) => [tool.id, tool]));
export function tool(id) {
    const found = byId.get(id);
    if (!found)
        throw new RangeError("Unknown studio");
    return found;
}
export function defaultSample(id) { return tool(id).sample; }
export function readiness(id, photo) {
    const row = tool(id);
    if (row.source === "planned")
        return { ready: false, reason: "Filters will be added after the must-have tools are complete." };
    if (!photo)
        return { ready: false, reason: "Load an on-device photo or a drawn sample first." };
    if (row.source === "youcam")
        return { ready: false, reason: "Use the Makeup / Hair styling screens with a quote and an explicit consented upload. This canvas does not silently send your photo." };
    if ((id === "recolour" || id === "balayage" || id === "grey") && !photo.hair)
        return { ready: false, reason: "Mark the hair area on your own photo first." };
    if (id === "balayage" && !photo.hairPaint)
        return { ready: false, reason: "Paint where you want the lightening placed first." };
    if (["older", "younger", "gender", "beard", "face-makeup", "skin", "portrait", "under-eye", "teeth", "shave"].includes(id) && photo.face?.length !== 478)
        return { ready: false, reason: "Read face points on this device, load matching recorded points, or try the drawn portrait sample." };
    if (id === "posture" && (!photo.body || !photo.person))
        return { ready: false, reason: "Mark the body control points and person area below, or use the drawn body sample." };
    if (id === "studio" && !photo.person)
        return { ready: false, reason: "Mark the person area or run the person segmenter on this device, or try the drawn portrait sample." };
    if (id === "hair-fibre" && !photo.crown)
        return { ready: false, reason: "Select the crown area below, or use the drawn crown sample." };
    return { ready: true };
}
export const SIDEBAR_SECTIONS = ["Local studio", "Adjust and crop", "YouCam styling", "Planned"];
export function toolsIn(category) {
    return CATALOGUE.filter((item) => item.category === category);
}
