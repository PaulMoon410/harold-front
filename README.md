# Harold Terminal

The Render static site serves the browser interface only. Its HTTPS API
endpoint is served by Harold on Lubuntu.

- Set the Render build command to `node build.cjs` and the publish directory
  to `publish`. The existing site URL does not need to change.
- The build defaults `API_BASE` to `https://lubuntu.tail239f3d.ts.net/v1`,
  with model `harold` for chat and self-talk. The retired port-8443 gateway is
  migrated to this default in both build configuration and saved browser settings.
  Override it with the tunnel's public HTTPS origin or `/v1` URL only if the
  backend address changes. Chat, self-talk, and image requests use that backend.
- Harold requires the existing API key for text chat, self-talk, and tools.
  Enter it in the top bar or API Settings. It is
  stored for the current browser-tab session, tied to the selected HTTPS API,
  and sent to that API for text chat and self-talk. Clear the field and save
  to remove it. Keys saved for the retired gateway are not transferred to the
  main API: re-enter the key after migration. A saved main-API key is preserved.
- The **TOOLS: AUTO** toggle enables backend-managed automatic tool selection
  for text chat and self-talk requests to `/v1/chat/completions`. It turns on
  when an API key is available and is off for keyless public chat. Tool use may
  increase response time; turn it off if preferred. It does not affect image
  requests.
- Attached chat images are previewed locally before sending. Enhance displays
  the processed image and a download link; its output is accessible by link.
- To create an image, enter a description and select **Create image**. The
  button uses Harold's authenticated image-provider chain when a key is saved,
  including visual-description learning through FTP/MCF memory. Without a key,
  it uses the separate rate-limited free endpoint, without shared-memory learning.
  Generated images are accessible by link; public results are eligible for cleanup
  after seven days. Do not include private material.
- Natural requests such as "Make me a picture of a waffle fighting a pancake"
  go through `/api/chat` instead of the native text-tool route. Generated replies
  and uploaded-image IDs stay in this chat's history so "change the last picture"
  can submit the actual prior image to the edit provider. Image edits require a
  configured editing provider and may incur its costs. Image links resolve against
  Harold's backend, not the Render static site.
- Learning uses observations of the returned image, not an invented description
  derived only from the prompt. It retains prompt/result concepts and edit lineage,
  not a locally trained image generator. Visual-learning failures remain visible
  without discarding a successfully generated image.
- Surreal scenes, mystical creatures, hybrid objects, and objects with appendages
  are supported image concepts, not requests to normalize into ordinary scenes.
  Explicit "draw", "paint", and "sketch" requests do not need the word "picture".
  The vision helper compares the returned scene with the request, reports mismatches
  beside the preview, and records those as failed examples. After external failures
  or a visual mismatch, Harold can make one local SVG illustration using drawing
  code from his ordered text providers. This is not photorealistic diffusion.
  Only visually accepted SVG recipes enter recipe learning; provider fidelity
  still cannot be guaranteed. No extra paid image-generation retry is made.
- Natural requests such as "Compose a 30-second dreamy soundtrack" use the
  authenticated backend and show a playable audio preview plus download link.
  Local music is synthesized instrumental audio, not vocals or studio recordings.
  Duration is 1-60 seconds; longer requests are rejected, not silently shortened.
  Waveform measurements, composition recipes, and subsequent conversation feedback
  feed Harold's FTP/text-learning pipeline. Measurement is not musical-quality
  verification or training of an audio model. Music files are accessible by link;
  local copies expire after seven days.
- The activity indicator shows observable upload, response, and retry stages.
  The backend does not currently stream its internal reasoning or tool steps.
- Before switching production, verify the tunnel supports browser CORS and
  `POST /v1/chat/completions`, `POST /api/chat/images`, `POST /api/chat`, and
  `POST /api/images/enhance`. A healthy `/health` endpoint alone is not enough.

Edit [index.html](./index.html), not the generated copy in `publish`. Run
`node build.cjs` then `node --test tests/*.test.cjs` to build and test locally.
