import { z } from 'zod';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from '../types/core';

export const aurSuggestionsQuerySchema = z.strictObject({
  q: z.string().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH).describe('Search term for AUR package name suggestions'),
});

export type AurSuggestionsQueryDto = z.infer<typeof aurSuggestionsQuerySchema>;
