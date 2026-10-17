#!/usr/bin/env bash

set -euo pipefail

case "$BUILD_CONTEXT" in
  /*|*..*) echo "::error::build_context must be a repository-relative path without '..'"; exit 2 ;;
esac
case "$DOCKERFILE_PATH" in
  /*|*..*) echo "::error::dockerfile_path must be a repository-relative path without '..'"; exit 2 ;;
esac

workspace=$(cd "$GITHUB_WORKSPACE" && pwd -P)
context=$(cd "$BUILD_CONTEXT" && pwd -P)
dockerfile=$(readlink -f "$DOCKERFILE_PATH")
[[ -d "$context" && ("$context" == "$workspace" || "$context" == "$workspace/"*) ]] \
  || { echo "::error::build_context must resolve inside the repository"; exit 2; }
[[ -f "$dockerfile" && "$dockerfile" == "$workspace/"* ]] \
  || { echo "::error::dockerfile_path must resolve inside the repository"; exit 2; }

target="${RUNNER_TEMP:?RUNNER_TEMP is required}/spi-native-test-context"
rm -rf "$target"
mkdir -p "$target"
cp -a "$context/." "$target/"
cp "$dockerfile" "$target/.spi.Dockerfile"
