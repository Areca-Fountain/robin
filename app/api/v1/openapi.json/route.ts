import { ENDPOINTS, ERROR_CODES, type Field } from "@/robin-api/spec";

/**
 * GET /api/v1/openapi.json   (public, no key needed)
 * An OpenAPI 3.0 description built from robin-api/spec.ts.
 * Import it into Postman, Insomnia, Swagger UI, or a code generator.
 */
function schemaFor(fields: Field[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    const base = f.type.split(" ")[0];
    properties[f.name] = {
      type: base === "integer" || base === "boolean" ? base : "string",
      description: f.description,
    };
    if (f.required) required.push(f.name);
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const paths: Record<string, Record<string, unknown>> = {};

  for (const e of ENDPOINTS) {
    const parameters: unknown[] = [];
    if (e.path.includes("{id}")) {
      parameters.push({ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } });
    }
    for (const q of e.query ?? []) {
      parameters.push({
        name: q.name,
        in: "query",
        required: false,
        description: q.description,
        schema: { type: q.type === "integer" ? "integer" : "string" },
      });
    }

    const responses: Record<string, unknown> = {};
    for (const s of e.statuses) {
      responses[String(s.code)] = {
        description: s.meaning,
        ...(s.code === 200 || s.code === 201
          ? { content: { "application/json": { example: e.exampleResponse } } }
          : {}),
      };
    }

    const op: Record<string, unknown> = {
      operationId: e.id,
      summary: e.summary,
      description:
        e.description +
        (e.scope ? ` Needs the ${e.scope} permission.` : "") +
        (e.needsVerified ? " Your company must be verified by Robin." : ""),
      security: [{ bearerAuth: [] }],
      parameters,
      responses,
    };
    if (e.method === "POST" && e.body) {
      op.requestBody = {
        required: true,
        content: { "application/json": { schema: schemaFor(e.body), example: e.exampleBody } },
      };
    }

    paths[e.path] = { ...(paths[e.path] ?? {}), [e.method.toLowerCase()]: op };
  }

  return Response.json(
    {
      openapi: "3.0.3",
      info: {
        title: "Robin API",
        version: "1.0.0",
        description:
          "Issue, list, verify and revoke blockchain-verified service letters from your own software. " +
          "Errors always look like { error: { code, message } }. Error codes: " +
          ERROR_CODES.map((c) => c.code).join(", ") +
          ".",
      },
      servers: [{ url: origin }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", description: "Your API key, starting with rbn_" },
        },
      },
      paths,
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
