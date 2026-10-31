import { defaultVisionClient } from "../vision/client.js";
export async function readPose(image) {
    const result = await defaultVisionClient().detectImage("pose", image, image.naturalWidth, image.naturalHeight, { maxFaces: 1 });
    const landmarks = result.output?.poses?.[0];
    const segmentation = result.output?.segmentation;
    if (!landmarks || landmarks.length !== 33 || !segmentation?.channels[0])
        return null;
    return { landmarks, mask: segmentation.channels[0], width: segmentation.width, height: segmentation.height };
}
