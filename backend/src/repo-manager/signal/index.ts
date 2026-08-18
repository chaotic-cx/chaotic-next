/**
 * Pure logic for the ELF signal scanner. Everything here operates on the raw
 * output of binutils/libarchive utils (strings) and returns plain data — no
 * filesystem or process access — so it can be unit tested without a container.
 */
export * from './parse';
export * from './plugin';
export * from './abi';
export * from './graph';
