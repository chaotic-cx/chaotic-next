import { type z } from 'zod';
import { createSchema } from 'zod-openapi';

function toOpenApi(schema: z.ZodType): Record<string, unknown> {
  const converted = createSchema(schema as never, { io: 'output', openapiVersion: '3.2.0' });
  return converted.schema as Record<string, unknown>;
}

/**
 * Converts a shared zod schema into the `schema` option of an
 * `@Api*Response` decorator, so response documentation comes from the same
 * annotated schemas the frontend validates against.
 */
export function schemaResponse(schema: z.ZodType): { schema: Record<string, unknown> } {
  return { schema: toOpenApi(schema) };
}

/** Array variant for `isArray: true` endpoints. */
export function schemaResponseArray(schema: z.ZodObject): { schema: Record<string, unknown> } {
  return { schema: { type: 'array', items: toOpenApi(schema) } };
}
