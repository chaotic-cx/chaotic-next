import { BadRequestException } from '@nestjs/common';

/**
 * Structural subset of a Standard Schema issue; avoids a hard dependency on
 * `@standard-schema/spec`. A path segment is a property key or an object
 * wrapping one (`{ key }`), matching the Standard Schema spec.
 */
interface ValidationIssue {
  readonly message: string;
  readonly path?: readonly ValidationPathSegment[];
}

type ValidationPathSegment = PropertyKey | { readonly key: PropertyKey };

function pathToString(path: ValidationPathSegment): string {
  return typeof path === 'object' ? String(path.key) : String(path);
}

/**
 * Builds the 400 response for request validation failures: a joined human
 * readable `message` (surfaced by frontend toasts) plus a machine readable
 * `errors` list with per-field paths.
 */
export function validationExceptionFactory(issues: readonly ValidationIssue[]): BadRequestException {
  const errors = issues.map((issue) => ({
    path: issue.path?.length ? issue.path.map(pathToString).join('.') : undefined,
    message: issue.message,
  }));
  return new BadRequestException(
    {
      message: errors.map((error) => (error.path ? `${error.path}: ${error.message}` : error.message)).join('; '),
      errors,
    },
    { errorCode: 'VALIDATION_FAILED' },
  );
}
