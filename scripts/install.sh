#!/usr/bin/env bash
set -euo pipefail

MIN_NODE_MAJOR=20
DEFAULT_NODE_MAJOR=22
PUBLIC_NPM_REGISTRY="https://registry.npmjs.org"
HOMEBREW_INSTALL_COMMIT="99e13e96cbbdc1ac1ac09c0a40b450bf219ef3aa"
HOMEBREW_INSTALL_SHA256="99287f194a8b3c9e6b0203a11a5fa54518be57209343e6bb954dec4635796d9d"
NODESOURCE_DISTRIBUTIONS_COMMIT="9b431d8ae0f10df272598585855c6eca6c0e1bd2"
NODESOURCE_DEB_SHA256="575583bbac2fccc0b5edd0dbc03e222d9f9dc8d724da996d22754d6411104fd1"
NODESOURCE_RPM_SHA256="b0ed2b9b66002e7ee802e8777cf3a92b25f1ecc0129812dc6f59a43a536810cc"

# Source repository this installer is published for. Git-ref installs build and
# run code from this fork, so these defaults route to the fork's own branch.
DEFAULT_REPO="m1krot1k1/paperclip"
DEFAULT_REF="main"

CANARY=0
VERSION=""
REF=""
REPO=""
NO_ONBOARD=0
NO_PROMPT=0
INSTALL_SERVICE=0
ONBOARD_ARGS=()
DRY_RUN=0
VERBOSE=0
TEMP_DIR=""
PIPED_INSTALL=0
INSTALL_SOURCE="git"

if [ -z "${BASH_SOURCE[0]:-}" ] || [ ! -f "${BASH_SOURCE[0]}" ]; then
  PIPED_INSTALL=1
fi

usage() {
  cat <<'EOF'
Install Paperclip on macOS, Linux, or WSL2.

Usage:
  curl -fsSLO https://raw.githubusercontent.com/m1krot1k1/paperclip/main/scripts/install.sh
  bash install.sh [options]
  curl -fsSL https://raw.githubusercontent.com/m1krot1k1/paperclip/main/scripts/install.sh | bash -s -- --no-prompt [options]

Options:
  --maybe-canary           Reserved (kept for compatibility); use --version
  --canary                 Install the npm canary channel
  --version <version>      Install an exact published npm version
  --no-onboard             Do not start onboarding after installation
  --no-prompt              Run non-interactively
  --install-service        Install the per-user Paperclip service
  --dry-run                Print the install plan without changing files
  --verbose                Enable verbose installer output
  -h, --help               Show this help

Every option also has a PAPERCLIP_INSTALL_* environment equivalent, for example
PAPERCLIP_INSTALL_VERSION=2026.722.0 and PAPERCLIP_INSTALL_NO_PROMPT=1.

The default source is a git build of this repository's own fork
(m1krot1k1/paperclip@main). Pass --version to install a published npm package
instead.
EOF
}

log() {
  printf '[paperclip] %s\n' "$*"
}

fail() {
  printf '[paperclip] error: %s\n' "$*" >&2
  exit 1
}

parse_bool() {
  local name="$1"
  local value="${2:-}"

  # ${value,,} requires bash 4; macOS ships bash 3.2, so lowercase portably.
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    ""|0|false|no|off) printf '0' ;;
    1|true|yes|on) printf '1' ;;
    *) fail "$name must be one of: 1, 0, true, false, yes, no, on, off" ;;
  esac
}

require_value() {
  local option="$1"
  local value="${2:-}"
  [ -n "$value" ] || fail "$option requires a value"
}

cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

CANARY="$(parse_bool PAPERCLIP_INSTALL_CANARY "${PAPERCLIP_INSTALL_CANARY:-}")"
VERSION="${PAPERCLIP_INSTALL_VERSION:-}"
REF="${PAPERCLIP_INSTALL_REF:-}"
REPO="${PAPERCLIP_INSTALL_REPO:-}"
NO_ONBOARD="$(parse_bool PAPERCLIP_INSTALL_NO_ONBOARD "${PAPERCLIP_INSTALL_NO_ONBOARD:-}")"
NO_PROMPT="$(parse_bool PAPERCLIP_INSTALL_NO_PROMPT "${PAPERCLIP_INSTALL_NO_PROMPT:-}")"
INSTALL_SERVICE="$(parse_bool PAPERCLIP_INSTALL_INSTALL_SERVICE "${PAPERCLIP_INSTALL_INSTALL_SERVICE:-}")"
DRY_RUN="$(parse_bool PAPERCLIP_INSTALL_DRY_RUN "${PAPERCLIP_INSTALL_DRY_RUN:-}")"
VERBOSE="$(parse_bool PAPERCLIP_INSTALL_VERBOSE "${PAPERCLIP_INSTALL_VERBOSE:-}")"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --canary)
      CANARY=1
      shift
      ;;
    --version)
      require_value "$1" "${2:-}"
      VERSION="$2"
      shift 2
      ;;
    --no-onboard)
      NO_ONBOARD=1
      shift
      ;;
    --no-prompt)
      NO_PROMPT=1
      shift
      ;;
    --install-service)
      INSTALL_SERVICE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    paperclipai)
      shift
      [ "${1:-}" = "onboard" ] && shift
      ONBOARD_ARGS=("$@")
      set --
      break
      ;;
    onboard)
      ONBOARD_ARGS=("$@")
      set --
      break
      ;;
    --)
      shift
      break
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

if [ "$CANARY" = "1" ] && [ -n "$VERSION" ]; then
  fail "--canary and --version cannot be used together"
fi

# Install source. The default is a git build from this fork so users get this
# repository's own code. An explicit npm request (--canary/--version) switches
# the source to the published npm package.
if [ "$CANARY" = "1" ] || [ -n "$VERSION" ]; then
  INSTALL_SOURCE="npm"
  if [ -n "$REF" ] || [ -n "$REPO" ]; then
    fail "--canary/--version install from npm; --ref/--repo are not supported for npm installs"
  fi
else
  if [ -z "$REF" ]; then
    REF="$DEFAULT_REF"
  fi
  if [ -z "$REPO" ]; then
    REPO="$DEFAULT_REPO"
  fi
  if [ -n "$REPO" ] && [ -z "$REF" ]; then
    fail "--repo requires --ref"
  fi
fi

if { [ ! -t 0 ] || [ ! -t 1 ]; } && [ "$NO_PROMPT" != "1" ]; then
  fail "non-interactive installation requires explicit --no-prompt; download the script first for interactive review"
fi

if [ "$VERBOSE" = "1" ]; then
  set -x
fi

OS="$(uname -s 2>/dev/null || true)"
ARCH="$(uname -m 2>/dev/null || true)"

case "$OS" in
  Darwin) OS_NAME="macos" ;;
  Linux) OS_NAME="linux" ;;
  *) fail "unsupported operating system: ${OS:-unknown}. Use macOS, Linux, or WSL2." ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_NAME="x64" ;;
  arm64|aarch64) ARCH_NAME="arm64" ;;
  *) fail "unsupported architecture: ${ARCH:-unknown}. Supported architectures: x64, arm64." ;;
esac

log "Detected $OS_NAME/$ARCH_NAME"

node_major() {
  local version
  version="$(node --version 2>/dev/null || true)"
  version="${version#v}"
  printf '%s' "${version%%.*}"
}

has_supported_node() {
  local major
  command -v node >/dev/null 2>&1 || return 1
  major="$(node_major)"
  [[ "$major" =~ ^[0-9]+$ ]] || return 1
  [ "$major" -ge "$MIN_NODE_MAJOR" ] || return 1
  command -v npm >/dev/null 2>&1 || return 1
  command -v npx >/dev/null 2>&1 || return 1
}

print_command() {
  printf '[paperclip] +'
  printf ' %q' "$@"
  printf '\n'
}

confirm_command() {
  print_command "$@"
  if [ "$NO_PROMPT" = "1" ]; then
    return 0
  fi

  local answer
  printf '[paperclip] Run this command? [y/N] ' >/dev/tty
  IFS= read -r answer </dev/tty || answer=""
  case "$answer" in
    y|Y|yes|YES|Yes) ;;
    *) fail "installation cancelled" ;;
  esac
}

run_command() {
  confirm_command "$@"
  "$@"
}

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    run_command "$@"
    return
  fi

  command -v sudo >/dev/null 2>&1 || fail "sudo is required to install Node.js with the system package manager"
  run_command sudo "$@"
}

ensure_temp_dir() {
  if [ -z "$TEMP_DIR" ]; then
    TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paperclip-install.XXXXXX")"
  fi
}

download_checked_script() {
  local url="$1"
  local destination="$2"
  local expected_sha256="$3"
  local actual_sha256

  command -v curl >/dev/null 2>&1 || fail "curl is required to bootstrap Node.js"
  curl --proto '=https' --tlsv1.2 -fsSL "$url" -o "$destination"
  [ -s "$destination" ] || fail "downloaded script is empty: $url"
  if command -v sha256sum >/dev/null 2>&1; then
    actual_sha256="$(sha256sum "$destination" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual_sha256="$(shasum -a 256 "$destination" | awk '{print $1}')"
  else
    fail "sha256sum or shasum is required to verify downloaded scripts"
  fi
  [ "$actual_sha256" = "$expected_sha256" ] || fail "checksum mismatch for downloaded script: $url"
  [ "$(head -c 2 "$destination")" = '#!' ] || fail "downloaded file is not an executable script: $url"
  bash -n "$destination" || fail "downloaded script failed syntax validation: $url"
}

check_version_manager() {
  if [ -n "${NVM_DIR:-}" ] || [ -d "${HOME:-}/.nvm" ]; then
    fail "nvm was detected. Run 'nvm install ${DEFAULT_NODE_MAJOR}' and retry this installer."
  fi
  if command -v asdf >/dev/null 2>&1 || [ -d "${HOME:-}/.asdf" ]; then
    fail "asdf was detected. Run 'asdf install nodejs ${DEFAULT_NODE_MAJOR}' and retry this installer."
  fi
}

install_node_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    ensure_temp_dir
    local brew_installer="$TEMP_DIR/homebrew-install.sh"
    log "Homebrew is required to install Node.js"
    download_checked_script "https://raw.githubusercontent.com/Homebrew/install/$HOMEBREW_INSTALL_COMMIT/install.sh" "$brew_installer" "$HOMEBREW_INSTALL_SHA256"
    if [ "$NO_PROMPT" = "1" ]; then
      run_command env NONINTERACTIVE=1 /bin/bash "$brew_installer"
    else
      run_command /bin/bash "$brew_installer"
    fi

    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi

  command -v brew >/dev/null 2>&1 || fail "Homebrew installation completed but 'brew' is not available on PATH"
  run_command brew install node
}

install_node_apt() {
  ensure_temp_dir
  local nodesource_installer="$TEMP_DIR/nodesource-setup.sh"
  run_privileged env DEBIAN_FRONTEND=noninteractive apt-get update
  run_privileged env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl
  download_checked_script "https://raw.githubusercontent.com/nodesource/distributions/$NODESOURCE_DISTRIBUTIONS_COMMIT/scripts/deb/setup_${DEFAULT_NODE_MAJOR}.x" "$nodesource_installer" "$NODESOURCE_DEB_SHA256"
  run_privileged env DEBIAN_FRONTEND=noninteractive bash "$nodesource_installer"
  run_privileged env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
}

install_node_dnf() {
  ensure_temp_dir
  local nodesource_installer="$TEMP_DIR/nodesource-setup.sh"
  run_privileged dnf install -y ca-certificates curl
  download_checked_script "https://raw.githubusercontent.com/nodesource/distributions/$NODESOURCE_DISTRIBUTIONS_COMMIT/scripts/rpm/setup_${DEFAULT_NODE_MAJOR}.x" "$nodesource_installer" "$NODESOURCE_RPM_SHA256"
  run_privileged bash "$nodesource_installer"
  run_privileged dnf install -y nodejs
}

install_node_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    install_node_apt
  elif command -v dnf >/dev/null 2>&1; then
    install_node_dnf
  elif command -v pacman >/dev/null 2>&1; then
    run_privileged pacman -Sy --noconfirm --needed nodejs npm
  elif command -v apk >/dev/null 2>&1; then
    run_privileged apk add --no-cache nodejs npm
  else
    fail "no supported Node.js package manager found. Supported: apt, dnf, pacman, apk."
  fi
}

ensure_pnpm() {
  command -v corepack >/dev/null 2>&1 || fail "corepack is required to build Paperclip from source; install Node.js >= $MIN_NODE_MAJOR (which bundles corepack), or run 'npm install -g corepack'"
  command -v pnpm >/dev/null 2>&1 || command -v corepack >/dev/null 2>&1 || return 1
  if command -v pnpm >/dev/null 2>&1 && ! command -v corepack >/dev/null 2>&1; then
    # pnpm present without corepack: fine.
    return 0
  fi
  # Ensure corepack's pnpm shim is available even when pnpm is not on PATH.
  command -v corepack >/dev/null 2>&1 || return 1
}

if has_supported_node; then
  log "Using Node.js $(node --version)"
else
  if command -v node >/dev/null 2>&1; then
    log "Node.js $(node --version 2>/dev/null || printf unknown) is too old; Node.js >= $MIN_NODE_MAJOR is required"
  else
    log "Node.js was not found"
  fi
  if [ "$PIPED_INSTALL" = "1" ]; then
    fail "Node.js bootstrap is disabled for piped installs; download install.sh, review it, and run 'bash install.sh --no-prompt'"
  fi
  check_version_manager
  log "Installing Node.js $DEFAULT_NODE_MAJOR"
  if [ "$OS_NAME" = "macos" ]; then
    install_node_macos
  else
    install_node_linux
  fi
  has_supported_node || fail "Node.js installation finished, but Node.js >= $MIN_NODE_MAJOR with npm/npx is not available"
  log "Installed Node.js $(node --version)"
fi

# ---------------------------------------------------------------------------
# Bootstrap: build the paperclipai CLI straight from this fork's source archive
# (no reliance on the independently published `paperclipai` npm package, which
# does not carry the same `install` command). This mirrors how the Paperclip
# CLI itself stages a git-ref install, only here it is the first step on a
# machine with no Paperclip CLI yet.
# ---------------------------------------------------------------------------
bootstrap_cli_from_fork() {
  local repo="$1"
  local ref="$2"
  local boot_dir base_dir cli_dir cli_entry

  command -v git >/dev/null 2>&1 || fail "git is required to install Paperclip from this repository"
  ensure_pnpm || fail "corepack (or pnpm) is required to build Paperclip from this repository"

  ensure_temp_dir
  boot_dir="$TEMP_DIR/bootstrap"
  mkdir -p "$boot_dir"

  log "Downloading $repo@$ref source from GitHub" >&2
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
    "https://codeload.github.com/$repo/tar.gz/$ref" -o "$boot_dir/source.tar.gz"
  [ -s "$boot_dir/source.tar.gz" ] || fail "failed to download $repo@$ref"

  base_dir="$boot_dir/source"
  mkdir -p "$base_dir"
  tar -xzf "$boot_dir/source.tar.gz" --strip-components=1 -C "$base_dir"

  cli_dir="$base_dir/cli"
  [ -f "$cli_dir/package.json" ] || fail "downloaded archive does not look like a Paperclip checkout (missing cli/package.json)"

  log "Installing dependencies and building the Paperclip CLI from $repo@$ref" >&2
  ( cd "$base_dir" \
      && if ! pnpm install --frozen-lockfile; then \
        log "Lockfile metadata differs from the downloaded patch set; refreshing it in the temporary checkout" >&2; \
        pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile; \
        pnpm install --frozen-lockfile; \
      fi \
      && bash scripts/build-npm.sh --skip-checks --skip-typecheck ) >&2 \
    || fail "failed to build the Paperclip CLI from $repo@$ref"

  # The bundled dist/index.js declares external runtime dependencies (commander,
  # picocolors, @paperclipai/server, embedded-postgres, ...). Running it in
  # place fails with MODULE_NOT_FOUND, so stage the built tarball with npm,
  # exactly like the Paperclip CLI's own git-install bootstrap.
  local tarball
  tarball="$(cd "$cli_dir" && npm pack --silent 2>/dev/null | tail -1)"
  [ -n "$tarball" ] && [ -f "$cli_dir/$tarball" ] || fail "failed to pack the Paperclip CLI from $repo@$ref"

  local cli_install_dir="$boot_dir/cli-install"
  mkdir -p "$cli_install_dir"
  ( cd "$cli_install_dir" \
      && npm install --no-fund --no-audit --omit=optional "$cli_dir/$tarball" ) >&2 \
    || fail "failed to install the Paperclip CLI from $repo@$ref"

  cli_entry="$cli_install_dir/node_modules/paperclipai/dist/index.js"
  [ -f "$cli_entry" ] || fail "installed Paperclip CLI entrypoint not found"
  printf '%s' "$cli_entry"
}

run_built_cli() {
  local cli_entry="$1"
  shift
  node "$cli_entry" "$@"
}

prepare_lan_allowed_hosts() {
  [ "${PAPERCLIP_ALLOWED_HOSTNAMES:-}" ] && return 0
  local hosts=""
  local candidate
  local interface_ip=""
  local public_ip=""
  if command -v ip >/dev/null 2>&1; then
    interface_ip="$(ip -o -4 addr show scope global 2>/dev/null | awk '{sub(/\/.*/, "", $4); print $4}' || true)"
  elif command -v ifconfig >/dev/null 2>&1; then
    interface_ip="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }' || true)"
  fi
  # A LAN bind is commonly accessed through the host's public IPv4 address,
  # which is not necessarily present on a local interface. Include it during
  # onboarding so authenticated/private mode works immediately after install.
  if command -v curl >/dev/null 2>&1; then
    public_ip="$(curl --fail --silent --show-error --max-time 5 -4 https://api.ipify.org 2>/dev/null || true)"
  fi
  for candidate in "$(hostname 2>/dev/null || true)" "$(hostname -f 2>/dev/null || true)" $interface_ip "$public_ip"; do
    candidate="$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]')"
    case "$candidate" in
      ""|localhost|localhost.localdomain|127.*|::1) continue ;;
    esac
    case ",$hosts," in
      *,"$candidate",*) ;;
      *) hosts="${hosts:+$hosts,}$candidate" ;;
    esac
  done
  [ -n "$hosts" ] && export PAPERCLIP_ALLOWED_HOSTNAMES="$hosts"
}

if [ "$INSTALL_SOURCE" = "npm" ]; then
  PACKAGE_SPEC="paperclipai@latest"
  if [ "$CANARY" = "1" ]; then
    PACKAGE_SPEC="paperclipai@canary"
  elif [ -n "$VERSION" ]; then
    PACKAGE_SPEC="paperclipai@$VERSION"
  fi

  INSTALL_ARGS=(install)
  [ "$CANARY" = "1" ] && INSTALL_ARGS+=(--canary)
  [ -n "$VERSION" ] && INSTALL_ARGS+=(--version "$VERSION")
  [ "$NO_PROMPT" = "1" ] && INSTALL_ARGS+=(--yes)
  ensure_temp_dir
  NPM_USERCONFIG="$TEMP_DIR/npmrc"
  printf 'registry=%s\n@paperclipai:registry=%s\n' "$PUBLIC_NPM_REGISTRY" "$PUBLIC_NPM_REGISTRY" >"$NPM_USERCONFIG"
  chmod 600 "$NPM_USERCONFIG"
  NPM_ENV=(env "NPM_CONFIG_REGISTRY=$PUBLIC_NPM_REGISTRY" "npm_config_registry=$PUBLIC_NPM_REGISTRY" "NPM_CONFIG_USERCONFIG=$NPM_USERCONFIG" "npm_config_userconfig=$NPM_USERCONFIG")

  log "Delegating to the Paperclip CLI"
  if [ "$DRY_RUN" = "1" ]; then
    print_command "${NPM_ENV[@]}" npx --yes "--registry=$PUBLIC_NPM_REGISTRY" "$PACKAGE_SPEC" "${INSTALL_ARGS[@]}"
    exit 0
  fi
  print_command "${NPM_ENV[@]}" npx --yes "--registry=$PUBLIC_NPM_REGISTRY" "$PACKAGE_SPEC" "${INSTALL_ARGS[@]}"
  "${NPM_ENV[@]}" npx --yes "--registry=$PUBLIC_NPM_REGISTRY" "$PACKAGE_SPEC" "${INSTALL_ARGS[@]}"

  if [ "$INSTALL_SERVICE" = "1" ]; then
    log "Installing the Paperclip service"
    print_command "${NPM_ENV[@]}" npx --yes "--registry=$PUBLIC_NPM_REGISTRY" "$PACKAGE_SPEC" service install
    "${NPM_ENV[@]}" npx --yes "--registry=$PUBLIC_NPM_REGISTRY" "$PACKAGE_SPEC" service install
  fi
else
  # git source: build the CLI from the fork, then install a managed payload
  # from that same fork and ref.
  if [ "$DRY_RUN" = "1" ]; then
    log "Would build the Paperclip CLI from $REPO@$REF, then run:"
    print_command node "<built-cli>/dist/index.js" install --repo "$REPO" --ref "$REF" --yes
    exit 0
  fi

  CLI_ENTRY="$(bootstrap_cli_from_fork "$REPO" "$REF")"
  log "Bootstrapped Paperclip CLI from $REPO@$REF"

  INSTALL_ARGS=(install --repo "$REPO" --ref "$REF")
  [ "$NO_PROMPT" = "1" ] && INSTALL_ARGS+=(--yes)
  print_command node "$CLI_ENTRY" "${INSTALL_ARGS[@]}"
  run_built_cli "$CLI_ENTRY" "${INSTALL_ARGS[@]}"

  if [ "$INSTALL_SERVICE" = "1" ]; then
    log "Installing the Paperclip service"
    print_command node "$CLI_ENTRY" service install
    run_built_cli "$CLI_ENTRY" service install
  fi
fi

if [ "$NO_ONBOARD" = "0" ] && [ -t 0 ] && [ -t 1 ]; then
  if command -v paperclipai >/dev/null 2>&1; then
    exec paperclipai onboard
  elif [ -x "${HOME:-}/.local/bin/paperclipai" ]; then
    exec "${HOME}/.local/bin/paperclipai" onboard
  else
    fail "Paperclip was installed, but 'paperclipai' is not available on PATH. Open a new shell and run 'paperclipai onboard'."
  fi
fi

if [ "$NO_ONBOARD" = "0" ]; then
  if [ "${#ONBOARD_ARGS[@]}" -gt 0 ]; then
    case " ${ONBOARD_ARGS[*]} " in
      *" --bind lan "*|*" --bind lan") prepare_lan_allowed_hosts ;;
    esac
    log "Running Paperclip onboarding"
    if [ "$INSTALL_SOURCE" = "npm" ]; then
      print_command "${NPM_ENV[@]}" npx --yes "--registry=$PUBLIC_NPM_REGISTRY" "$PACKAGE_SPEC" onboard "${ONBOARD_ARGS[@]}"
      "${NPM_ENV[@]}" npx --yes "--registry=$PUBLIC_NPM_REGISTRY" "$PACKAGE_SPEC" onboard "${ONBOARD_ARGS[@]}"
    else
      print_command node "$CLI_ENTRY" onboard "${ONBOARD_ARGS[@]}"
      run_built_cli "$CLI_ENTRY" onboard "${ONBOARD_ARGS[@]}"
    fi
  else
    log "Installation complete. Next: paperclipai onboard"
  fi
else
  log "Installation complete."
fi
