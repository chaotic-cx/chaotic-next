/**
 * Valid Arch Linux package names per PKGBUILD(5): letters, digits, and the
 * characters `@ . _ + -`, starting with a letter or digit.
 */
export const PKGNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_@.+-]*$/;

export const MAX_PKGNAME_LENGTH = 255;

export function isValidPkgname(pkgname: string): boolean {
  return PKGNAME_PATTERN.test(pkgname) && pkgname.length <= MAX_PKGNAME_LENGTH;
}
