import type { ConsumerAbiBreak, SymbolBreak, VtableBreak } from '../../interfaces/repo-manager';
import type { NmSymbolWithSize, RelocationEntry } from './parse';

/**
 * The ordered list of virtual-slot targets of one vtable. The vtable symbol
 * (`_ZTV...`) gives the address range; absolute relocations inside that range
 * are the slots, sorted by offset — i.e. by slot index.
 */
export interface VtableSlots {
  symbol: string;
  slots: string[];
}

export function extractVtableSlots(relocations: RelocationEntry[], symbols: NmSymbolWithSize[]): VtableSlots[] {
  const abs = relocations.filter((r) => r.type === 'R_X86_64_64' && r.symbol);
  const vtables = symbols.filter((s) => s.name.startsWith('_ZTV') && s.size > 0);
  const result: VtableSlots[] = [];
  for (const vtable of vtables) {
    const slots = abs
      .filter((r) => r.offset >= vtable.address && r.offset < vtable.address + vtable.size)
      .sort((a, b) => a.offset - b.offset)
      .map((r) => r.symbol)
      .filter((name): name is string => name !== undefined && !name.startsWith('_ZTI'));
    if (slots.length > 0) result.push({ symbol: vtable.name, slots });
  }
  return result;
}

/**
 * Classify ABI compatibility between an old and a new vtable slot list. Qt/KDE's
 * binary-compat rule is that slots may only be *appended* at the end, so the old
 * list must be a strict prefix of the new one; anything else is a break.
 */
export type VtableDrift = 'compatible' | 'break';
export function classifyVtableDrift(oldSlots: string[], newSlots: string[]): VtableDrift {
  if (oldSlots.length === 0) return 'compatible';
  if (newSlots.length < oldSlots.length) return 'break';
  const isPrefix = oldSlots.every((slot, i) => newSlots[i] === slot);
  return isPrefix ? 'compatible' : 'break';
}

export function findVtableDrifts(
  oldVtables: Record<string, string[]>,
  newVtables: Record<string, string[]>,
): { vtable: string; shiftedSlots: string[] }[] {
  const drifts: { vtable: string; shiftedSlots: string[] }[] = [];
  for (const [vtable, oldSlots] of Object.entries(oldVtables)) {
    const newSlots = newVtables[vtable] ?? [];
    if (classifyVtableDrift(oldSlots, newSlots) === 'compatible') continue;
    const firstMismatch = oldSlots.findIndex((slot, i) => slot !== newSlots[i]);
    const shifted = firstMismatch === -1 ? oldSlots : oldSlots.slice(firstMismatch);
    drifts.push({ vtable, shiftedSlots: shifted });
  }
  return drifts;
}

export function findSymbolBreaks(
  consumerImports: string[],
  oldExports: Record<string, string[]>,
  newExports: Record<string, string[]>,
): { symbol: string; soname: string }[] {
  const breaks: { symbol: string; soname: string }[] = [];
  const consumerImportSet = new Set(consumerImports);

  for (const [soname, oldSymbols] of Object.entries(oldExports)) {
    // The library the consumer imports from must still exist (else the ABI
    // soname channel handles it). Only the exported set may have changed.
    if (!(soname in newExports)) continue;
    const newSet = new Set(newExports[soname]);
    for (const symbol of oldSymbols) {
      if (consumerImportSet.has(symbol) && !newSet.has(symbol)) {
        breaks.push({ symbol, soname });
      }
    }
  }
  return breaks;
}

export function formatSymbolBreak(breakEntry: SymbolBreak): string {
  return `${breakEntry.pkgname}: ${breakEntry.soname}: symbol ${breakEntry.symbol} missing`;
}

export function findVtableBreaks(
  consumerImports: string[],
  oldVtables: Record<string, string[]>,
  newVtables: Record<string, string[]>,
): { vtable: string; slot: string }[] {
  const breaks: { vtable: string; slot: string }[] = [];
  const consumerImportSet = new Set(consumerImports);
  for (const { vtable, shiftedSlots } of findVtableDrifts(oldVtables, newVtables)) {
    for (const slot of shiftedSlots) {
      if (consumerImportSet.has(slot)) breaks.push({ vtable, slot });
    }
  }
  return breaks;
}

function formatVtableBreak(breakEntry: VtableBreak): string {
  return `${breakEntry.pkgname}: vtable drift (${breakEntry.vtable})`;
}

export function formatConsumerAbiBreak(breakEntry: ConsumerAbiBreak): string {
  if ('symbol' in breakEntry) return formatSymbolBreak(breakEntry);
  return formatVtableBreak(breakEntry);
}
