#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE="$HERE/../validate-upstream-repo/action.sh"
WORKFLOW="$HERE/../../workflows/init-complete.yml"
TEMPLATE_SYNC="$HERE/../../template-workflows/sync-template.yml"
SETUP_UPSTREAM="$HERE/../init-helpers/setup-upstream.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

die() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null
EOF
chmod +x "$TMP/bin/gh"

run_validation() {
  local body="$1" output="$2"
  : > "$output"
  PATH="$TMP/bin:$PATH" COMMENT_BODY="$body" ISSUE_NUMBER=1 GITHUB_TOKEN=test \
    GITHUB_OUTPUT="$output" bash "$VALIDATE" >/dev/null
}

value() {
  sed -n "s/^$2=//p" "$1" | tail -1
}

run_validation "owner/service" "$TMP/filter.out"
[ "$(value "$TMP/filter.out" should_proceed)" = "true" ] || die "default mode rejected"
[ "$(value "$TMP/filter.out" sync_mode)" = "filter" ] || die "default mode is not filter"
ok "default initialization remains filter mode"

run_validation $'https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite\nmode: passthrough' "$TMP/passthrough.out"
[ "$(value "$TMP/passthrough.out" should_proceed)" = "true" ] || die "passthrough mode rejected"
[ "$(value "$TMP/passthrough.out" sync_mode)" = "passthrough" ] || die "passthrough mode not exported"
ok "passthrough initialization input validated"

run_validation $'owner/service\nmode: mirror' "$TMP/invalid.out"
[ "$(value "$TMP/invalid.out" should_proceed)" = "false" ] || die "customer mirror mode accepted by first-tier initialization"
[ -z "$(value "$TMP/invalid.out" upstream_repo)" ] || die "invalid mode exported an upstream repository"
ok "unsupported initialization mode fails closed"

git config --global user.name harness
git config --global user.email harness@local
git init -q --bare "$TMP/source.git"
git init -q "$TMP/source-work"
git -C "$TMP/source-work" checkout -qb main
echo source > "$TMP/source-work/source.txt"
git -C "$TMP/source-work" add source.txt
git -C "$TMP/source-work" commit -qm "source"
git -C "$TMP/source-work" tag source-v1
git -C "$TMP/source-work" remote add origin "$TMP/source.git"
git -C "$TMP/source-work" push -q origin main --tags
git -C "$TMP/source.git" symbolic-ref HEAD refs/heads/main

git init -q --bare "$TMP/destination.git"
git init -q "$TMP/template-work"
git -C "$TMP/template-work" checkout -qb main
echo template > "$TMP/template-work/template.txt"
git -C "$TMP/template-work" add template.txt
git -C "$TMP/template-work" commit -qm "template"
git -C "$TMP/template-work" tag template-v1
git -C "$TMP/template-work" remote add origin "$TMP/destination.git"
git -C "$TMP/template-work" push -q origin main --tags
git -C "$TMP/destination.git" symbolic-ref HEAD refs/heads/main

git clone -q "$TMP/destination.git" "$TMP/init-work"
git -C "$TMP/init-work" config url."$TMP/source.git".insteadOf https://example.test/source.git
(cd "$TMP/init-work" && SYNC_MODE=passthrough bash "$SETUP_UPSTREAM" https://example.test/source >/dev/null)
git -C "$TMP/init-work" show-ref --verify --quiet refs/upstream-tags/source-v1 \
  || die "source tag was not isolated under refs/upstream-tags"
if git -C "$TMP/init-work" show-ref --verify --quiet refs/tags/source-v1; then
  die "source tag leaked into the template-derived tag namespace before publication"
fi
git -C "$TMP/init-work" show-ref --verify --quiet refs/tags/template-v1 \
  || die "pre-existing destination tag disappeared"
git -C "$TMP/init-work" push -q --atomic origin 'refs/upstream-tags/*:refs/tags/*'
git -C "$TMP/init-work" fetch -q origin --tags
git -C "$TMP/destination.git" show-ref --verify --quiet refs/tags/source-v1 \
  || die "isolated source tag was not published"
VERSION=$(git -C "$TMP/init-work" describe --tags --abbrev=0 upstream/main)
[ "$VERSION" = "source-v1" ] || die "published source tag cannot describe the upstream tip"
ok "passthrough source tags stay isolated from template tags"

grep -q 'gh variable set SYNC_MODE' "$WORKFLOW" || die "initialization does not persist the selected mode"
grep -q 'Passthrough mode keeps the upstream tree intact' "$WORKFLOW" || die "passthrough generation branch missing"
grep -q 'Passthrough mode has no fork-owned seed trees' "$WORKFLOW" || die "passthrough still seeds Maven trees"
grep -q "refs/upstream-tags/\\*:refs/tags/\\*" "$WORKFLOW" || die "passthrough initialization does not publish isolated upstream tags"
grep -q "if: vars.SYNC_MODE != 'mirror'" "$TEMPLATE_SYNC" || die "template sync gating changed unexpectedly"
if grep -q "vars.SYNC_MODE != 'passthrough'" "$TEMPLATE_SYNC"; then
  die "passthrough must continue receiving template updates"
fi
ok "workflow preserves history, tags, and the template delivery channel"

printf '\nAll initialization mode harness checks passed.\n'
