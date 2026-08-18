#!/bin/sh
set -e

# Offline repo mirror signal indexer.
#   MIRROR (required) - path to a mounted repo mirror (read-only).
#   OUT    (required) - output path for the seed JSON (must NOT live inside MIRROR).
#   REPOS  (optional) - comma-separated repo names, default "core,extra".
#   ARCH_DIR (optional) - per-repo subdir holding .files DB and archives,
#                         default "os/x86_64" (Arch). Use "x86_64" for
#                         Chaotic-AUR / Garuda mirrors.
#   CONCURRENCY (optional) - parallel scan workers, default 4.
#
# Examples:
#   docker run --rm \
#     -v /mnt/arch-mirror:/mirror:ro \
#     -v /srv/seeds:/out \
#     -e MIRROR=/mirror \
#     -e OUT=/out/seed.json \
#     chaotic/offline-indexer
#
#   docker run --rm \
#     -v /srv/http/repos:/repos:ro \
#     -v /srv/seeds:/out \
#     -e MIRROR=/repos \
#     -e REPOS=chaotic-aur,garuda \
#     -e ARCH_DIR=x86_64 \
#     -e OUT=/out/seed.json \
#     chaotic/offline-indexer

: "${MIRROR:?MIRROR must point at the mounted repo mirror}"
: "${OUT:?OUT must point at the output seed file (outside the mirror)}"
: "${REPOS:=core,extra}"
: "${ARCH_DIR:=os/x86_64}"
: "${CONCURRENCY:=4}"

exec node /app/index.cjs \
  --mirror "$MIRROR" \
  --repos "$REPOS" \
  --arch-dir "$ARCH_DIR" \
  --out "$OUT" \
  --concurrency "$CONCURRENCY"
