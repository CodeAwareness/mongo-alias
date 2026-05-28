#!/bin/bash
set -e

# Publish mongo-alias to the public npm registry.
#
# Usage:
#   ./deploy.sh -m "summary"                  — patch bump (default) + publish
#   ./deploy.sh patch|minor|major -m "summary"— explicit semver bump + publish
#   ./deploy.sh --no-bump                     — publish the existing package.json
#                                               version (use when it was already
#                                               bumped in a prior commit)
#
# Semver guidance:
#   patch — backward-compatible bug fix (no API change)
#   minor — new backward-compatible capability (new export/option)
#   major — breaking change (removed/renamed export, changed signature/behavior)
#
# What ships is controlled by package.json "files" (dist + README.md). The
# "prepublishOnly": "tsc" script compiles src -> dist automatically at publish
# time, so there is no manual build step here.

BUMP="patch"
MESSAGE=""

# Parse args: an optional bump keyword / --no-bump, and an optional -m "message".
while [ $# -gt 0 ]; do
  case "$1" in
    patch|minor|major|--no-bump) BUMP="$1"; shift ;;
    -m|--message)                MESSAGE="$2"; shift 2 ;;
    *)
      echo "ERROR: unknown argument '$1'. Expected [patch|minor|major|--no-bump] [-m \"summary\"]." >&2
      exit 1
      ;;
  esac
done

# --- Preflight ---------------------------------------------------------------

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found on PATH." >&2
  exit 1
fi

# Must be logged in to npm with publish rights to `mongo-alias`.
if ! npm whoami >/dev/null 2>&1; then
  echo "ERROR: not logged in to npm. Run 'npm login' first." >&2
  exit 1
fi

# Refuse to publish a dirty tree — what you publish should match what's committed.
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree is not clean. Commit or stash changes before deploying." >&2
  git status --short >&2
  exit 1
fi

# A changelog summary is required for any version bump.
if [ "$BUMP" != "--no-bump" ] && [ -z "$MESSAGE" ]; then
  echo "ERROR: a changelog summary is required when bumping. Pass -m \"what changed\"." >&2
  exit 1
fi

# --- Test --------------------------------------------------------------------

echo "==> Running tests"
npm test

# --- Bump --------------------------------------------------------------------

if [ "$BUMP" = "--no-bump" ]; then
  VERSION="$(node -p "require('./package.json').version")"
  echo "==> Skipping bump; publishing existing version $VERSION"
else
  # --no-git-tag-version matches this repo's tag-less release history.
  echo "==> Bumping version ($BUMP)"
  npm version "$BUMP" --no-git-tag-version >/dev/null
  VERSION="$(node -p "require('./package.json').version")"
  echo "    -> $VERSION"

  echo "==> Prepending HISTORY.md entry"
  TMP="$(mktemp)"
  printf 'v.%s - %s\n' "$VERSION" "$MESSAGE" > "$TMP"
  cat HISTORY.md >> "$TMP"
  mv "$TMP" HISTORY.md

  echo "==> Committing release $VERSION"
  git add package.json HISTORY.md
  git commit -q -m "release $VERSION"
fi

# --- Publish -----------------------------------------------------------------

echo "==> Publishing mongo-alias@$VERSION to npm (runs prepublishOnly: tsc)"
npm publish

echo "==> Pushing commits"
git push

echo "==> Done. Published mongo-alias@$VERSION"
echo "    Verify with: npm view mongo-alias version"
