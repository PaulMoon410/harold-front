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
- Authenticated generated images/music retain local chat previews and add a
  GeoCities HTML share link with a preview/player and download. FTP or page-upload
  errors remain visible; GeoCities may require a Cloudflare check. No ad network
  is connected. Anonymous images still depend on free-provider availability.
- Download options open `bake.html` on this Render site, separate from GeoCities'
  injected ads. The preview and "Download without contributing" always remain
  available; Lubuntu serves the file with an attachment header.
- The optional worker is a **proof-of-work test**, not a cryptocurrency miner or
  Cake-credit integration. It is disabled by default. On Lubuntu, setting
  `HAROLD_DOWNLOAD_WORK_MODE=pow-test` enables the explicitly labeled test.
  Users must click Start; it defaults to one worker at 10% duty, allows at most
  two workers at 50% duty each, and stops when a valid proof is found or after
  at most 10 seconds. Stop, navigating away, hiding the tab, timeout or an error
  terminates workers. Duty is scheduling time, not a guaranteed CPU-utilization
  percentage. Mobile users should consider battery and heat.
- Lubuntu issues expiring challenges and verifies real SHA-256 proofs, not a
  client countdown. Sessions are bounded and completion is single-use. Because
  media previews/files are already public and participation is optional, this
  is not a paywall or enforced mining gate.
- `hash-wasm` is pinned in the npm lockfile. The build self-hosts its SHA-256
  UMD bundle (with embedded WASM) and MIT license under `download-assets/`.
  Run `npm ci --ignore-scripts`, `npm run build`, and `npm test`. The existing
  Render command `node build.cjs` installs the pinned dependency with `npm ci`
  if it is missing. No public miner/CDN script, browser-blocker evasion,
  localhost callback or secret browser wallet credentials are used.
- Real mining needs a selected currency/algorithm, configured pool and public
  payout account, plus a tested Lubuntu Stratum bridge and share verification.
  None is connected; this CPU test earns no money or Cake credits.
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
