# Harold Terminal

The Render static site serves the browser interface only. Its HTTPS API
endpoint is served by Harold on Lubuntu.

- Set the Render build command to `node build.cjs` and the publish directory
  to `publish`. The existing site URL does not need to change.
- Set `API_BASE` to the tunnel's public HTTPS origin (or its `/v1` URL), then
  redeploy. Without it, visitors can enter an endpoint in **API Settings**.
  Chat, self-talk, and image requests all use the same configured backend.
- No API key is required or sent by the browser. The configured API endpoint
  handles requests without a user-supplied key.
- Before switching production, verify the tunnel supports browser CORS and
  `POST /v1/chat/completions`, `POST /api/chat/images`, `POST /api/chat`, and
  `POST /api/images/enhance`. A healthy `/health` endpoint alone is not enough.

Edit [index.html](./index.html), not the generated copy in `publish`. Run
`node build.cjs` then `node --test tests/*.test.cjs` to build and test locally.
