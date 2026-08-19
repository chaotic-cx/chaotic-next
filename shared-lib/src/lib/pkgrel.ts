export function parsePkgrel(raw: string): { pkgrel: number; bump: number } {
  const [pkgrelPart = '0', bumpPart = '0'] = raw.split('.');
  const pkgrel = Number.parseInt(pkgrelPart, 10);
  const bump = Number.parseInt(bumpPart, 10);
  return { pkgrel: Number.isFinite(pkgrel) ? pkgrel : 0, bump: Number.isFinite(bump) ? bump : 0 };
}

export function formatPkgrel(pkgrel: number, bump: number): string {
  return bump > 0 ? `${pkgrel}.${bump}` : `${pkgrel}`;
}
