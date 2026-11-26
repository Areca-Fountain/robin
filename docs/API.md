# Robin API for customers

Companies connect their own software (HR system, website, scripts) to Robin with an **API key**.

| Where | What |
|---|---|
| `/dashboard/api` | The customer console: **API Keys**, **Quick start**, **Playground**, **Usage** |
| `/developers` | Public developer docs (built from `robin-api/spec.ts`) |
| `/api/v1/openapi.json` | OpenAPI file. Import into Postman or Swagger |
| `examples/robin-client.mjs` | Node.js client that also does the Cardano signing step |
| `scripts/api-smoke-test.mjs` | Automatic checks of the API (no blockchain needed) |

## Endpoints (all under `/api/v1`, key in `Authorization: Bearer rbn_...`)

| Method and path | Permission | Needs verified company |
|---|---|---|
| `GET /me` | any key | no |
| `GET /formats` | letters:read | no |
| `GET /letters` (`limit`, `page`, `status`) | letters:read | no |
| `GET /letters/{id}` | letters:read | no |
| `POST /verify` | letters:read | no |
| `POST /letters` (prepare) | letters:write | yes |
| `POST /letters/{id}/confirm` | letters:write | yes |
| `POST /letters/{id}/revoke` (prepare) | letters:write | no |
| `POST /letters/{id}/revoke/confirm` | letters:write | no |

Issuing and revoking are 3 steps because Robin never holds the company's wallet key:
prepare (Robin) -> sign and submit (the company's server) -> confirm (Robin).

## Rate limit

60 calls per minute per key. Change it with `ROBIN_API_RATE_LIMIT_PER_MIN` in `.env.local`.
Answers carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Over the limit: `429` + `Retry-After`.

## Changing the API later

Edit the handler in `robin-api/handlers/`, wire it in `app/api/v1/.../route.ts` with `withApiLog(...)`,
and add it to `robin-api/spec.ts` so the docs, OpenAPI file and Playground stay correct.
