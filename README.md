# Harold Terminal

The Render static site serves the browser interface only. Its HTTPS API
endpoint is served by Harold on Lubuntu.

- Set the Render build command to `node build.cjs` and the publish directory
  to `publish`. The existing site URL does not need to change.
- The build defaults `API_BASE` to `https://lubuntu.tail239f3d.ts.net:8443/v1`.
  Override it with the tunnel's public HTTPS origin or `/v1` URL only if the
  backend address changes. Chat, self-talk, and image requests use that backend.
- The public gateway accepts chat-only and image requests without a browser API
  key. Coding and tool-enabled API requests remain protected by server auth.
- An optional API key can be entered in the top bar or API Settings. It is
  stored for the current browser-tab session, tied to the selected HTTPS API,
  and sent to that API for text chat and self-talk. Clear the field and save
  to remove it. The public chat endpoint does not require or validate the key;
  entering one does not enable public tool calls.
- The **TOOLS: AUTO** toggle enables backend-managed automatic tool selection
  for text chat and self-talk requests to `/v1/chat/completions`. It turns on
  when an API key is available and is off for keyless public chat. Tool use may
  increase response time; turn it off if preferred. It does not affect image
  requests.
- Attached chat images are previewed locally before sending. Enhance displays
  the processed image and a download link; its output is accessible by link.
- To create an image, enter a description and select **Create image**. The
  description goes to an external free provider; generated images are accessible
  by link and eligible for cleanup after seven days. Public generation is rate limited.
- The activity indicator shows observable upload, response, and retry stages.
  The backend does not currently stream its internal reasoning or tool steps.
- Before switching production, verify the tunnel supports browser CORS and
  `POST /v1/chat/completions`, `POST /api/chat/images`, `POST /api/chat`, and
  `POST /api/images/enhance`. A healthy `/health` endpoint alone is not enough.

Edit [index.html](./index.html), not the generated copy in `publish`. Run
`node build.cjs` then `node --test tests/*.test.cjs` to build and test locally.
