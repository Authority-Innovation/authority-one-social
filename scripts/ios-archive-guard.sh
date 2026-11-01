#!/usr/bin/env bash
#
# ios-archive-guard.sh - refuse to ship an iOS archive that was built without .env
#
# Why: build 34 was archived from a checkout with no .env. Expo inlines
# EXPO_PUBLIC_* at bundle time, so the bundle silently lost
# EXPO_PUBLIC_DISABLE_AGE_ASSURANCE (age assurance came back on) and
# EXPO_PUBLIC_ENV (IS_TESTFLIGHT became false). Nothing failed; the build just
# behaved differently.
#
# Usage:
#   scripts/ios-archive-guard.sh pre  [project_dir]
#       Run BEFORE archiving. Refuses (exit 1) unless <project_dir>/.env
#       (default: the repo root) exists and sets every required key to a
#       non-empty value.
#
#   scripts/ios-archive-guard.sh post <archive_log_path>
#       Run AFTER archiving, on the captured xcodebuild output, e.g.
#         xcodebuild ... archive 2>&1 | tee /tmp/ao-archive.log
#         scripts/ios-archive-guard.sh post /tmp/ao-archive.log
#       Refuses (exit 1) unless the log is a successful archive
#       ("** ARCHIVE SUCCEEDED **"), shows Expo loading .env while bundling
#       ("env: load .env") and the "env: export ..." line lists every
#       required key.
#
# Required keys default to EXPO_PUBLIC_DISABLE_AGE_ASSURANCE and EXPO_PUBLIC_ENV;
# override with AO_ARCHIVE_REQUIRED_KEYS="KEY_A KEY_B".
#
# Agent Live (pre): the LiveKit SDK and the iOS 'audio' background mode ship
# only in a build with EXPO_PUBLIC_AGENT_LIVE_ENABLED=true (plugins/agentLive).
# `pre` refuses an archive whose ios/ was prebuilt with the flag on (an 'audio'
# background mode, LiveKit pods, or no LiveKit autolinking exclude) while the
# flag for this archive (the environment, else .env) is not exactly 'true'.
# An archive WITH the flag on is refused too, unless
# AO_ARCHIVE_ALLOW_AGENT_LIVE=1 says it is meant to be a Live build.
#
# Only key NAMES are ever printed - never values.
#
# Exit codes: 0 ok, 1 refused, 2 usage error.

set -euo pipefail

REQUIRED_KEYS=(${AO_ARCHIVE_REQUIRED_KEYS:-EXPO_PUBLIC_DISABLE_AGE_ASSURANCE EXPO_PUBLIC_ENV})

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

usage() {
  sed -n '3,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
}

refuse() {
  echo "ios-archive-guard: REFUSED - $*" >&2
  exit 1
}

# Prints "set" if KEY has a non-empty value in the env file, else nothing.
# The value itself is never echoed.
key_state() {
  local file="$1" key="$2"
  awk -v key="$key" '
    {
      line = $0
      sub(/^[ \t]*export[ \t]+/, "", line)
      if (line ~ /^[ \t]*#/) next
      eq = index(line, "=")
      if (eq == 0) next
      k = substr(line, 1, eq - 1)
      gsub(/[ \t]/, "", k)
      if (k != key) next
      v = substr(line, eq + 1)
      sub(/[ \t]+#.*$/, "", v)
      gsub(/^[ \t"'\'']+|[ \t"'\'']+$/, "", v)
      found = (length(v) > 0) ? "set" : "empty"
    }
    END { if (found != "") print found }
  ' "$file"
}

# The value of KEY in the env file, for comparisons only. Never printed.
key_value() {
  local file="$1" key="$2"
  awk -v key="$key" '
    {
      line = $0
      sub(/^[ \t]*export[ \t]+/, "", line)
      if (line ~ /^[ \t]*#/) next
      eq = index(line, "=")
      if (eq == 0) next
      k = substr(line, 1, eq - 1)
      gsub(/[ \t]/, "", k)
      if (k != key) next
      v = substr(line, eq + 1)
      sub(/[ \t]+#.*$/, "", v)
      gsub(/^[ \t"'\'']+|[ \t"'\'']+$/, "", v)
      out = v
    }
    END { print out }
  ' "$file"
}

# Agent Live: the native project must match the flag this archive is built with.
check_agent_live() {
  local dir="$1" env_file="$2"
  local flag="${EXPO_PUBLIC_AGENT_LIVE_ENABLED-}"
  [[ -n "$flag" ]] || flag="$(key_value "$env_file" EXPO_PUBLIC_AGENT_LIVE_ENABLED)"

  if [[ "$flag" == "true" ]]; then
    [[ "${AO_ARCHIVE_ALLOW_AGENT_LIVE:-}" == "1" ]] ||
      refuse "EXPO_PUBLIC_AGENT_LIVE_ENABLED is true for this archive. Agent Live is a development-live build only; set AO_ARCHIVE_ALLOW_AGENT_LIVE=1 if this archive is meant to be one."
    return 0
  fi

  local ios="$dir/ios"
  [[ -d "$ios" ]] || return 0
  local problems=()
  local plist
  for plist in "$ios"/*/Info.plist; do
    [[ -f "$plist" ]] || continue
    # The <array> after the UIBackgroundModes key (XML plist, as prebuild writes it).
    if awk '
      /<key>UIBackgroundModes<\/key>/ { inmodes = 1; next }
      inmodes && /<\/array>/ { inmodes = 0 }
      inmodes && /<string>audio<\/string>/ { found = 1 }
      END { exit found ? 0 : 1 }
    ' "$plist"; then
      problems+=("${plist#$dir/} declares the 'audio' background mode")
    fi
  done
  if [[ -f "$ios/Podfile" ]] && ! grep -q "use_expo_modules!(exclude: \[.*@livekit/react-native" "$ios/Podfile"; then
    problems+=("ios/Podfile has no LiveKit autolinking exclude")
  fi
  if [[ -f "$ios/Podfile.lock" ]] && grep -Eq 'LiveKitWebRTC|livekit-react-native' "$ios/Podfile.lock"; then
    problems+=("ios/Podfile.lock links LiveKit")
  fi
  ((${#problems[@]} == 0)) ||
    refuse "ios/ was prebuilt for Agent Live but this archive has it off: $(IFS='; '; echo "${problems[*]}"). Re-run prebuild (--clean) and pod install with the flag off."
}

cmd_pre() {
  local dir="${1:-$repo_root}"
  local env_file="$dir/.env"
  [[ -f "$env_file" ]] ||
    refuse "$env_file is missing. Copy it into this checkout before archiving (EXPO_PUBLIC_* are inlined at bundle time)."

  local missing=() empty=()
  for key in "${REQUIRED_KEYS[@]}"; do
    case "$(key_state "$env_file" "$key")" in
      set) ;;
      empty) empty+=("$key") ;;
      *) missing+=("$key") ;;
    esac
  done
  ((${#missing[@]} == 0)) || refuse ".env lacks: ${missing[*]}"
  ((${#empty[@]} == 0)) || refuse ".env has empty values for: ${empty[*]}"

  check_agent_live "$dir" "$env_file"

  echo "ios-archive-guard: pre OK - $env_file sets ${REQUIRED_KEYS[*]}; Agent Live native state matches the flag"
}

cmd_post() {
  local log="${1:-}"
  [[ -n "$log" ]] || usage
  [[ -f "$log" ]] || refuse "archive log $log not found"

  # Strip ANSI colour codes; xcodebuild/expo output may contain them.
  local clean
  clean="$(sed $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$log")"

  grep -Fq '** ARCHIVE SUCCEEDED **' <<<"$clean" ||
    refuse "$log is not a successful xcodebuild archive log (no '** ARCHIVE SUCCEEDED **')"

  grep -Eq 'env: load .*\.env' <<<"$clean" ||
    refuse "no 'env: load .env' line in $log - the JS bundle was built without .env"

  local export_lines
  export_lines="$(grep -E 'env: export ' <<<"$clean" || true)"
  [[ -n "$export_lines" ]] ||
    refuse "no 'env: export ...' line in $log - Expo exported no env vars into the bundle"

  local missing=()
  for key in "${REQUIRED_KEYS[@]}"; do
    grep -Eq "(^|[[:space:]])${key}([[:space:]]|$)" <<<"$export_lines" ||
      missing+=("$key")
  done
  ((${#missing[@]} == 0)) ||
    refuse "the bundle's 'env: export' line does not include: ${missing[*]}"

  echo "ios-archive-guard: post OK - bundle loaded .env and exported ${REQUIRED_KEYS[*]}"
}

case "${1:-}" in
  pre) shift; cmd_pre "$@" ;;
  post) shift; cmd_post "$@" ;;
  -h | --help | help | "") usage ;;
  *) echo "unknown command: $1" >&2; usage ;;
esac
