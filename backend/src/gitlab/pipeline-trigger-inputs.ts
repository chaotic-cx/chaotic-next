import {
  PIPELINE_ADD_PACKAGES_REGEX,
  PIPELINE_OPERATIONS,
  PIPELINE_PACKAGES_REGEX,
  PIPELINE_REF_REGEX,
  PIPELINE_REQUEST_REASONS,
  type PipelineOperation,
} from '@chaotic-next/shared-lib';
import { BadRequestException } from '@nestjs/common';

/** CI variable carrying the triggering user into the pipeline. */
export const PIPELINE_TRIGGERED_BY_VARIABLE = 'PIPELINE_TRIGGERED_BY';

export const DEFAULT_PIPELINE_REF = 'main';

const OPERATIONS_REQUIRING_PACKAGES: PipelineOperation[] = ['Bump Packages', 'Schedule Packages', 'Drop Packages'];

export interface ValidatedPipelineTrigger {
  ref: string;
  /** Only the inputs relevant for the chosen operation, ready for the GitLab API call. */
  inputs: Record<string, string>;
}

function assertValidString(value: unknown, field: string, regex?: RegExp): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required and must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (regex && !regex.test(trimmed)) {
    throw new BadRequestException(`${field} has an invalid format`);
  }
  return trimmed;
}

function optionalString(body: Record<string, unknown>, field: string, regex?: RegExp): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === '') return undefined;
  return assertValidString(value, field, regex);
}

/**
 * Validates a pipeline trigger request against the pipeline's spec:inputs rules
 * (options, regex constraints and the per-operation required inputs) and returns
 * the ref plus the inputs to forward to GitLab.
 */
export function validatePipelineTriggerInputs(body: unknown): ValidatedPipelineTrigger {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  const operation = record.operation;
  if (typeof operation !== 'string' || !(PIPELINE_OPERATIONS as readonly string[]).includes(operation)) {
    throw new BadRequestException(`operation must be one of: ${PIPELINE_OPERATIONS.join(', ')}`);
  }

  const ref =
    record.ref === undefined ? DEFAULT_PIPELINE_REF : assertValidString(record.ref, 'ref', PIPELINE_REF_REGEX);
  const inputs: Record<string, string> = { operation };

  if (OPERATIONS_REQUIRING_PACKAGES.includes(operation as PipelineOperation)) {
    inputs.packages = assertValidString(record.packages, 'packages', PIPELINE_PACKAGES_REGEX);
  } else {
    const packages = optionalString(record, 'packages', PIPELINE_PACKAGES_REGEX);
    if (packages !== undefined) inputs.packages = packages;
  }

  if (operation === 'Run Schedule') {
    inputs.trigger = assertValidString(record.trigger, 'trigger');
  }

  if (operation === 'Add Packages') {
    inputs.add_packages = assertValidString(record.add_packages, 'add_packages', PIPELINE_ADD_PACKAGES_REGEX);
    inputs.request_origin = assertValidString(record.request_origin, 'request_origin');

    const requestReason = optionalString(record, 'request_reason');
    if (requestReason !== undefined && !(PIPELINE_REQUEST_REASONS as readonly string[]).includes(requestReason)) {
      throw new BadRequestException(`request_reason must be one of: ${PIPELINE_REQUEST_REASONS.join(', ')}`);
    }
    if (requestReason !== undefined) inputs.request_reason = requestReason;

    const customRequestReason = optionalString(record, 'custom_request_reason');
    if (customRequestReason !== undefined) inputs.custom_request_reason = customRequestReason;
  }

  return { ref, inputs };
}
