import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { validatePipelineTriggerInputs } from './pipeline-trigger-inputs';

describe('validatePipelineTriggerInputs', () => {
  it('rejects a non-object body', () => {
    expect(() => validatePipelineTriggerInputs('nope')).toThrow(BadRequestException);
    expect(() => validatePipelineTriggerInputs(null)).toThrow(BadRequestException);
  });

  it('rejects a missing or unknown operation', () => {
    expect(() => validatePipelineTriggerInputs({})).toThrow(BadRequestException);
    expect(() => validatePipelineTriggerInputs({ operation: 'Explode Packages' })).toThrow(BadRequestException);
  });

  it('accepts operation None without any further inputs and defaults the ref', () => {
    expect(validatePipelineTriggerInputs({ operation: 'None' })).toEqual({
      ref: 'main',
      inputs: { operation: 'None' },
    });
  });

  it('accepts a custom ref', () => {
    const result = validatePipelineTriggerInputs({ operation: 'None', ref: 'dev' });
    expect(result.ref).toBe('dev');
  });

  it('rejects an invalid ref', () => {
    expect(() => validatePipelineTriggerInputs({ operation: 'None', ref: 'not a ref!' })).toThrow(BadRequestException);
  });

  it.each(['Bump Packages', 'Schedule Packages', 'Drop Packages'])(
    'requires packages for operation %s',
    (operation) => {
      expect(() => validatePipelineTriggerInputs({ operation })).toThrow(BadRequestException);
      expect(() => validatePipelineTriggerInputs({ operation, packages: '   ' })).toThrow(BadRequestException);

      const result = validatePipelineTriggerInputs({ operation, packages: 'nodejs:20:hplip' });
      expect(result.inputs).toEqual({ operation, packages: 'nodejs:20:hplip' });
    },
  );

  it('rejects packages with an invalid format', () => {
    expect(() => validatePipelineTriggerInputs({ operation: 'Bump Packages', packages: 'a;b' })).toThrow(
      BadRequestException,
    );
  });

  it('requires trigger for operation Run Schedule', () => {
    expect(() => validatePipelineTriggerInputs({ operation: 'Run Schedule' })).toThrow(BadRequestException);

    const result = validatePipelineTriggerInputs({ operation: 'Run Schedule', trigger: 'daily' });
    expect(result.inputs).toEqual({ operation: 'Run Schedule', trigger: 'daily' });
  });

  it('requires add_packages and request_origin for operation Add Packages', () => {
    expect(() => validatePipelineTriggerInputs({ operation: 'Add Packages' })).toThrow(BadRequestException);
    expect(() => validatePipelineTriggerInputs({ operation: 'Add Packages', add_packages: 'paru/aur' })).toThrow(
      BadRequestException,
    );

    const result = validatePipelineTriggerInputs({
      operation: 'Add Packages',
      add_packages: 'paru/aur',
      request_origin: 'github/5678',
    });
    expect(result.inputs).toEqual({
      operation: 'Add Packages',
      add_packages: 'paru/aur',
      request_origin: 'github/5678',
    });
  });

  it('rejects add_packages with an invalid format', () => {
    expect(() =>
      validatePipelineTriggerInputs({ operation: 'Add Packages', add_packages: 'paru', request_origin: 'x' }),
    ).toThrow(BadRequestException);
  });

  it('accepts multiple space-separated packages with sources', () => {
    const result = validatePipelineTriggerInputs({
      operation: 'Add Packages',
      add_packages: 'paru/aur zen-browser/https://github.com/zen-browser/browser',
      request_origin: 'forum/tne',
    });
    expect(result.inputs.add_packages).toBe('paru/aur zen-browser/https://github.com/zen-browser/browser');
  });

  it('rejects an unknown request_reason', () => {
    expect(() =>
      validatePipelineTriggerInputs({
        operation: 'Add Packages',
        add_packages: 'paru/aur',
        request_origin: 'github/5678',
        request_reason: 'because',
      }),
    ).toThrow(BadRequestException);
  });

  it('passes through valid request_reason and custom_request_reason', () => {
    const result = validatePipelineTriggerInputs({
      operation: 'Add Packages',
      add_packages: 'paru/aur',
      request_origin: 'github/5678',
      request_reason: 'depends:make',
      custom_request_reason: 'build-time dependency of my package',
    });
    expect(result.inputs.request_reason).toBe('depends:make');
    expect(result.inputs.custom_request_reason).toBe('build-time dependency of my package');
  });

  it('drops empty optional inputs instead of forwarding them', () => {
    const result = validatePipelineTriggerInputs({
      operation: 'None',
      packages: '',
      trigger: null,
      request_reason: undefined,
    });
    expect(result.inputs).toEqual({ operation: 'None' });
  });

  it('trims whitespace from inputs', () => {
    const result = validatePipelineTriggerInputs({ operation: 'Bump Packages', packages: '  nodejs  ' });
    expect(result.inputs.packages).toBe('nodejs');
  });
});
