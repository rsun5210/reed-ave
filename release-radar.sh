#!/bin/zsh

set -euo pipefail

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"

CURL_BIN="/usr/bin/curl"
JQ_BIN="/usr/bin/jq"
DATE_BIN="/bin/date"
PYTHON_BIN="$(command -v python3 || true)"
MKTEMP_BIN="$(command -v mktemp || true)"
CAT_BIN="/bin/cat"
AWK_BIN="/usr/bin/awk"
TAIL_BIN="/usr/bin/tail"
SLEEP_BIN="/bin/sleep"
EXCLUDED_GENRE_PATTERN='rap|hip hop|hip-hop|trap|drill|grime'
FULL_RESCAN_INTERVAL_DAYS=14
MAX_RATE_LIMIT_RETRIES=8
ARTIST_REQUEST_DELAY_SECONDS=1

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SPOTIFY_RADAR_CONFIG:-$ROOT_DIR/.release-radar.json}"
CACHE_DIR="${SPOTIFY_RADAR_CACHE_DIR:-$ROOT_DIR/.release-radar-cache}"
RADAR_TIMEZONE="${SPOTIFY_RADAR_TIMEZONE:-America/Los_Angeles}"
STATE_FILE="$CACHE_DIR/state.json"
LIBRARY_CACHE_FILE="$CACHE_DIR/library.jsonl"
GENRE_CACHE_FILE="$CACHE_DIR/artist_genres.json"
RELEASE_CACHE_DIR="$CACHE_DIR/release_windows_v3"
ALBUM_TRACK_CACHE_DIR="$CACHE_DIR/album_tracks_v2"

if [[ -z "$PYTHON_BIN" ]]; then
  echo "Missing dependency: python3" >&2
  exit 1
fi

if [[ -z "$MKTEMP_BIN" ]]; then
  echo "Missing dependency: mktemp" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing config file: $CONFIG_FILE" >&2
  echo "Copy .release-radar.example.json to .release-radar.json and fill in your Spotify credentials." >&2
  exit 1
fi

CLIENT_ID="$("$JQ_BIN" -r '.client_id' "$CONFIG_FILE")"
REFRESH_TOKEN="$("$JQ_BIN" -r '.refresh_token' "$CONFIG_FILE")"
PLAYLIST_NAME="$("$JQ_BIN" -r '.playlist_name // "Release Radar"' "$CONFIG_FILE")"
PLAYLIST_ID="$("$JQ_BIN" -r '.playlist_id // empty' "$CONFIG_FILE")"
MIN_SAVED_TRACKS="$("$JQ_BIN" -r '.minimum_saved_tracks_per_artist // 2' "$CONFIG_FILE")"

if [[ -z "$CLIENT_ID" || "$CLIENT_ID" == "null" || -z "$REFRESH_TOKEN" || "$REFRESH_TOKEN" == "null" ]]; then
  echo "Config file must contain client_id and refresh_token." >&2
  exit 1
fi

TMP_DIR="$("$MKTEMP_BIN" -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$CACHE_DIR" "$RELEASE_CACHE_DIR" "$ALBUM_TRACK_CACHE_DIR"

saved_tracks_file="$TMP_DIR/saved_tracks.jsonl"
release_candidates_file="$TMP_DIR/release_candidates.jsonl"
selected_tracks_file="$TMP_DIR/selected_tracks.json"
playlists_file="$TMP_DIR/playlists.jsonl"
qualified_artists_file="$TMP_DIR/qualified_artists.json"
touch "$saved_tracks_file" "$release_candidates_file" "$playlists_file"

if [[ ! -f "$STATE_FILE" ]]; then
  printf '%s\n' '{}' > "$STATE_FILE"
fi

if [[ ! -f "$GENRE_CACHE_FILE" ]]; then
  printf '%s\n' '{}' > "$GENRE_CACHE_FILE"
fi

if [[ ! -f "$LIBRARY_CACHE_FILE" ]]; then
  : > "$LIBRARY_CACHE_FILE"
fi

log() {
  printf '%s\n' "$1" >&2
}

refresh_access_token() {
  local token_payload
  local next_refresh_token

  log "Refreshing Spotify token..."
  token_payload="$(spotify_accounts_post "refresh_token")"
  ACCESS_TOKEN="$(printf '%s' "$token_payload" | "$JQ_BIN" -r '.access_token')"
  next_refresh_token="$(printf '%s' "$token_payload" | "$JQ_BIN" -r '.refresh_token // empty')"

  if [[ -n "$next_refresh_token" ]]; then
    write_config "$next_refresh_token"
    REFRESH_TOKEN="$next_refresh_token"
  fi
}

spotify_request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local headers_file="$TMP_DIR/spotify.headers"
  local body_file="$TMP_DIR/spotify.body"
  local http_code
  local retry_after
  local backoff_seconds=5
  local retry_count=0
  local refresh_count=0

  while :; do
    if [[ -n "$body" ]]; then
      http_code="$("$CURL_BIN" -sS -D "$headers_file" -o "$body_file" -w '%{http_code}' \
        -X "$method" "$url" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$body")"
    else
      http_code="$("$CURL_BIN" -sS -D "$headers_file" -o "$body_file" -w '%{http_code}' \
        -X "$method" "$url" \
        -H "Authorization: Bearer $ACCESS_TOKEN")"
    fi

    if [[ "$http_code" == "429" ]]; then
      retry_count=$((retry_count + 1))
      retry_after="$("$AWK_BIN" 'BEGIN{IGNORECASE=1} /^Retry-After:/ {gsub("\r","",$2); print $2}' "$headers_file" | "$TAIL_BIN" -n 1)"
      if [[ -z "$retry_after" ]]; then
        retry_after="$backoff_seconds"
      fi
      if [[ "$retry_after" -lt "$backoff_seconds" ]]; then
        retry_after="$backoff_seconds"
      fi
      log "Spotify rate limit hit for $method $url. Waiting ${retry_after}s before retrying (attempt $retry_count/$MAX_RATE_LIMIT_RETRIES)..."
      if [[ "$retry_count" -ge "$MAX_RATE_LIMIT_RETRIES" ]]; then
        printf 'Spotify rate limit persisted for %s %s after %s retries.\n' "$method" "$url" "$retry_count" >&2
        return 1
      fi
      "$SLEEP_BIN" "$retry_after"
      if [[ "$backoff_seconds" -lt 60 ]]; then
        backoff_seconds=$((backoff_seconds * 2))
        if [[ "$backoff_seconds" -gt 60 ]]; then
          backoff_seconds=60
        fi
      fi
      continue
    fi

    if [[ "$http_code" == "401" && "$refresh_count" -lt 1 ]]; then
      refresh_count=$((refresh_count + 1))
      log "Spotify access token expired during $method $url. Refreshing and retrying..."
      refresh_access_token
      continue
    fi

    if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
      printf 'Spotify API request failed (%s): %s\n' "$http_code" "$("$CAT_BIN" "$body_file")" >&2
      return 1
    fi

    backoff_seconds=5
    "$CAT_BIN" "$body_file"
    return 0
  done
}

spotify_get_or_skip() {
  local path="$1"
  if ! spotify_request "GET" "https://api.spotify.com/v1$path"; then
    return 1
  fi
}

write_json_file() {
  local path="$1"
  local content="$2"
  printf '%s\n' "$content" > "$path"
}

update_state() {
  local filter="$1"
  local temp_file="$TMP_DIR/state.next.json"
  "$JQ_BIN" "$filter" "$STATE_FILE" > "$temp_file"
  mv "$temp_file" "$STATE_FILE"
}

today_epoch() {
  "$DATE_BIN" +%s
}

days_between_epochs() {
  local now_epoch="$1"
  local then_epoch="$2"
  echo $(( (now_epoch - then_epoch) / 86400 ))
}

write_config() {
  local next_refresh_token="$1"
  local updated_config

  updated_config="$("$JQ_BIN" \
    --arg refresh_token "$next_refresh_token" \
    '.refresh_token = $refresh_token' \
    "$CONFIG_FILE")"

  printf '%s\n' "$updated_config" > "$CONFIG_FILE"
}

write_playlist_id() {
  local next_playlist_id="$1"
  local updated_config

  updated_config="$("$JQ_BIN" \
    --arg playlist_id "$next_playlist_id" \
    '.playlist_id = $playlist_id' \
    "$CONFIG_FILE")"

  printf '%s\n' "$updated_config" > "$CONFIG_FILE"
}

spotify_accounts_post() {
  local response
  local http_code

  response="$("$CURL_BIN" -sS -w '\n%{http_code}' -X POST "https://accounts.spotify.com/api/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "grant_type=$1" \
    --data-urlencode "refresh_token=$REFRESH_TOKEN")"

  http_code="$(printf '%s\n' "$response" | tail -n 1)"
  response="$(printf '%s\n' "$response" | sed '$d')"

  if [[ "$http_code" != "200" ]]; then
    echo "Spotify token refresh failed ($http_code): $response" >&2
    exit 1
  fi

  printf '%s\n' "$response"
}

refresh_access_token

spotify_get() {
  local path="$1"
  spotify_request "GET" "https://api.spotify.com/v1$path"
}

spotify_get_paginated_items() {
  local path="$1"
  local page_size="${2:-50}"
  local page_file
  local separator='?'
  local offset=0
  local page
  local items_count

  if [[ "$path" == *\?* ]]; then
    separator='&'
  fi

  page_file="$("$MKTEMP_BIN" "$TMP_DIR/paginated.XXXXXX.jsonl")"
  : > "$page_file"

  while :; do
    page="$(spotify_get "${path}${separator}limit=${page_size}&offset=${offset}")"
    items_count="$(printf '%s' "$page" | "$JQ_BIN" '.items | length')"

    if [[ "$items_count" -eq 0 ]]; then
      break
    fi

    printf '%s' "$page" | "$JQ_BIN" -c '.items[]' >> "$page_file"

    if [[ "$items_count" -lt "$page_size" ]]; then
      break
    fi

    offset=$((offset + items_count))
  done

  "$JQ_BIN" -s '.' "$page_file"
}

spotify_post_json() {
  local path="$1"
  local json="$2"
  spotify_request "POST" "https://api.spotify.com/v1$path" "$json"
}

spotify_put_json() {
  local path="$1"
  local json="$2"
  spotify_request "PUT" "https://api.spotify.com/v1$path" "$json" >/dev/null
}

get_state_value() {
  local query="$1"
  "$JQ_BIN" -r "$query // empty" "$STATE_FILE"
}

should_run_full_library_scan() {
  local cached_lines
  local last_full_scan_epoch
  local now_epoch

  cached_lines="$(wc -l < "$LIBRARY_CACHE_FILE" | tr -d ' ')"
  if [[ "$cached_lines" -eq 0 ]]; then
    return 0
  fi

  last_full_scan_epoch="$(get_state_value '.last_full_scan_epoch')"
  if [[ -z "$last_full_scan_epoch" ]]; then
    return 0
  fi

  now_epoch="$(today_epoch)"
  if [[ "$(days_between_epochs "$now_epoch" "$last_full_scan_epoch")" -ge "$FULL_RESCAN_INTERVAL_DAYS" ]]; then
    return 0
  fi

  return 1
}

dedupe_library_cache() {
  local source_file="$1"
  local temp_file="$TMP_DIR/library.deduped.jsonl"
  "$JQ_BIN" -s -c '
    unique_by(.track.id + "|" + .added_at)
    | sort_by(.added_at)
    | reverse
    | .[]
  ' "$source_file" > "$temp_file"
  mv "$temp_file" "$LIBRARY_CACHE_FILE"
}

full_library_scan() {
  local offset=0
  local total_loaded=0
  local page
  local items_count
  local latest_added_at=""

  : > "$saved_tracks_file"
  : > "$LIBRARY_CACHE_FILE"
  log "Running full liked-song scan..."

  while :; do
    page="$(spotify_get "/me/tracks?limit=50&offset=$offset")"
    items_count="$(printf '%s' "$page" | "$JQ_BIN" '.items | length')"
    if [[ "$items_count" -eq 0 ]]; then
      break
    fi

    if [[ -z "$latest_added_at" ]]; then
      latest_added_at="$(printf '%s' "$page" | "$JQ_BIN" -r '.items[0].added_at // empty')"
    fi

    printf '%s' "$page" | "$JQ_BIN" -c '.items[]' >> "$saved_tracks_file"
    total_loaded=$((total_loaded + items_count))

    if (( total_loaded % 500 == 0 )); then
      log "Loaded $total_loaded liked songs..."
    fi

    if [[ "$items_count" -lt 50 ]]; then
      break
    fi

    offset=$((offset + items_count))
  done

  cp "$saved_tracks_file" "$LIBRARY_CACHE_FILE"
  update_state ".last_full_scan_epoch = $(today_epoch) | .latest_added_at = \"$latest_added_at\""
  log "Full scan complete: $total_loaded liked songs cached."
}

incremental_library_scan() {
  local latest_cached_added_at
  local page
  local items_count
  local newest_seen_added_at=""
  local stop_scan=0
  local new_items_file="$TMP_DIR/library.new.jsonl"
  local total_loaded=0
  local total_new=0

  latest_cached_added_at="$(get_state_value '.latest_added_at')"
  : > "$new_items_file"

  log "Running incremental liked-song scan..."

  local offset=0
  while [[ "$stop_scan" -eq 0 ]]; do
    page="$(spotify_get "/me/tracks?limit=50&offset=$offset")"
    items_count="$(printf '%s' "$page" | "$JQ_BIN" '.items | length')"
    if [[ "$items_count" -eq 0 ]]; then
      break
    fi

    if [[ -z "$newest_seen_added_at" ]]; then
      newest_seen_added_at="$(printf '%s' "$page" | "$JQ_BIN" -r '.items[0].added_at // empty')"
    fi

    printf '%s' "$page" | "$JQ_BIN" -c --arg latest "$latest_cached_added_at" '
      .items[]
      | select(($latest == "") or (.added_at > $latest))
    ' >> "$new_items_file"

    total_loaded=$((total_loaded + items_count))
    total_new="$(wc -l < "$new_items_file" | tr -d ' ')"

    if (( total_loaded % 500 == 0 )); then
      log "Checked $total_loaded liked songs pages, found $total_new new entries..."
    fi

    if printf '%s' "$page" | "$JQ_BIN" -e --arg latest "$latest_cached_added_at" '
      any(.items[]?; ($latest != "") and (.added_at <= $latest))
    ' >/dev/null; then
      stop_scan=1
    elif [[ "$items_count" -lt 50 ]]; then
      stop_scan=1
    else
      offset=$((offset + items_count))
    fi
  done

  if [[ -s "$new_items_file" ]]; then
    cat "$new_items_file" "$LIBRARY_CACHE_FILE" > "$TMP_DIR/library.merged.jsonl"
    dedupe_library_cache "$TMP_DIR/library.merged.jsonl"
    if [[ -n "$newest_seen_added_at" ]]; then
      update_state ".latest_added_at = \"$newest_seen_added_at\""
    fi
    log "Incremental scan complete: added $total_new new liked-song entries to cache."
  else
    log "Incremental scan complete: no new liked songs found."
  fi
}

sync_library_cache() {
  if should_run_full_library_scan; then
    full_library_scan
  else
    incremental_library_scan
  fi
}

hydrate_artist_details_cache() {
  local source_file="$1"
  local total_artists
  local missing_ids_file="$TMP_DIR/missing_artist_ids.txt"
  local fetched_details_file="$TMP_DIR/fetched_artist_details.jsonl"
  local merged_cache_file="$TMP_DIR/artist_genres.next.json"

  total_artists="$("$JQ_BIN" 'length' "$source_file")"
  if [[ "$total_artists" -eq 0 ]]; then
    return
  fi

  "$JQ_BIN" -r --slurpfile cache "$GENRE_CACHE_FILE" '
    .[]
    | select((($cache[0] // {})[.artist.id] // null) == null)
    | .artist.id
  ' "$source_file" > "$missing_ids_file"

  if [[ ! -s "$missing_ids_file" ]]; then
    return
  fi

  : > "$fetched_details_file"
  local missing_total
  missing_total="$(wc -l < "$missing_ids_file" | tr -d ' ')"
  log "Fetching Spotify genre details for $missing_total artists..."

  local start_line=1
  while [[ "$start_line" -le "$missing_total" ]]; do
    local end_line=$((start_line + 49))
    local ids
    ids="$(sed -n "${start_line},${end_line}p" "$missing_ids_file" | paste -sd, -)"
    spotify_get "/artists?ids=$ids" | "$JQ_BIN" -c '.artists[]' >> "$fetched_details_file"
    start_line=$((end_line + 1))
  done

  "$JQ_BIN" -s '
    (.[0] // {}) as $existing
    | (.[1:] // []) as $fetched
    | ($fetched | map({key: .id, value: .}) | from_entries) as $fetchedById
    | $existing + $fetchedById
  ' "$GENRE_CACHE_FILE" "$fetched_details_file" > "$merged_cache_file"
  mv "$merged_cache_file" "$GENRE_CACHE_FILE"
}

build_or_load_qualified_artists() {
  log "Building qualifying artists from cached liked songs..."
  "$JQ_BIN" -s --argjson minimum "$MIN_SAVED_TRACKS" '
    map(.track.artists[])
    | group_by(.id)
    | map({ artist: .[0], saved_track_count: length })
    | map(select(.saved_track_count >= $minimum))
    | sort_by(-.saved_track_count)
  ' "$LIBRARY_CACHE_FILE" > "$qualified_artists_file"

  hydrate_artist_details_cache "$qualified_artists_file"

  "$JQ_BIN" -n \
    --slurpfile qualified "$qualified_artists_file" \
    --slurpfile cache "$GENRE_CACHE_FILE" \
    --arg pattern "$EXCLUDED_GENRE_PATTERN" '
    $qualified[0]
    | map(.artist = ((($cache[0] // {})[.artist.id]) // .artist))
    | map(select(((.artist.genres // []) | join(" ") | ascii_downcase) | test($pattern) | not))
  ' /dev/null > "$TMP_DIR/qualified_artists.filtered.json"

  mv "$TMP_DIR/qualified_artists.filtered.json" "$qualified_artists_file"
}

album_track_cache_path() {
  local album_id="$1"
  printf '%s/%s.json' "$ALBUM_TRACK_CACHE_DIR" "$album_id"
}

week_release_cache_path() {
  local artist_id="$1"
  printf '%s/%s-%s.jsonl' "$RELEASE_CACHE_DIR" "$WINDOW_START" "$artist_id"
}

compute_release_window() {
  "$PYTHON_BIN" - "$RADAR_TIMEZONE" <<'PY'
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sys

tz = ZoneInfo(sys.argv[1])
today = datetime.now(tz).date()
days_until_friday = (4 - today.weekday()) % 7
window_end = today + timedelta(days=days_until_friday)
window_start = window_end - timedelta(days=6)
window_end_exclusive = window_end + timedelta(days=1)

print(window_start.isoformat())
print(window_end.isoformat())
print(window_end_exclusive.isoformat())
PY
}

window_parts=("${(@f)$(compute_release_window)}")
WINDOW_START="${window_parts[1]}"
WINDOW_INCLUSIVE_END="${window_parts[2]}"
WINDOW_END_EXCLUSIVE="${window_parts[3]}"

log "Scanning liked songs for artists with $MIN_SAVED_TRACKS+ saved tracks..."
sync_library_cache
build_or_load_qualified_artists

qualified_artists="$(cat "$qualified_artists_file")"
qualified_count="$("$JQ_BIN" 'length' "$qualified_artists_file")"
if [[ "$qualified_count" -eq 0 ]]; then
  echo "No artists with at least $MIN_SAVED_TRACKS liked songs were found."
  exit 0
fi

log "Found $qualified_count qualifying artists. Looking for releases from $WINDOW_START to $WINDOW_INCLUSIVE_END..."

for (( artist_index=0; artist_index<qualified_count; artist_index++ )); do
  if (( (artist_index + 1) % 50 == 0 )); then
    log "Checked $((artist_index + 1)) of $qualified_count qualifying artists..."
  fi

  artist_id="$(printf '%s' "$qualified_artists" | "$JQ_BIN" -r ".[$artist_index].artist.id")"
  artist_name="$(printf '%s' "$qualified_artists" | "$JQ_BIN" -r ".[$artist_index].artist.name")"
  saved_track_count="$(printf '%s' "$qualified_artists" | "$JQ_BIN" -r ".[$artist_index].saved_track_count")"
  artist_release_cache_file="$(week_release_cache_path "$artist_id")"

  if [[ -f "$artist_release_cache_file" ]]; then
    cat "$artist_release_cache_file" >> "$release_candidates_file"
    continue
  fi

  "$SLEEP_BIN" "$ARTIST_REQUEST_DELAY_SECONDS"
  : > "$artist_release_cache_file"

  if ! albums_page="$(spotify_get_paginated_items "/artists/$artist_id/albums?include_groups=album,single,appears_on" 50)"; then
    log "Skipping artist after repeated failures or rate limits: $artist_name"
    rm -f "$artist_release_cache_file"
    continue
  fi
  recent_albums="$(printf '%s' "$albums_page" | "$JQ_BIN" --arg start "$WINDOW_START" --arg end "$WINDOW_END_EXCLUSIVE" '
    unique_by(.id)
    | map(select((.album_type == "album") or (.album_type == "single") or (.album_group == "appears_on")))
    | map(select(.release_date_precision == "day"))
    | map(select(.release_date >= $start and .release_date < $end))
  ')"

  album_total="$(printf '%s' "$recent_albums" | "$JQ_BIN" 'length')"
  if [[ "$album_total" -eq 0 ]]; then
    continue
  fi

  for (( album_index=0; album_index<album_total; album_index++ )); do
    album="$(printf '%s' "$recent_albums" | "$JQ_BIN" ".[$album_index]")"
    album_id="$(printf '%s' "$album" | "$JQ_BIN" -r '.id')"
    album_name="$(printf '%s' "$album" | "$JQ_BIN" -r '.name')"
    album_url="$(printf '%s' "$album" | "$JQ_BIN" -r '.external_urls.spotify')"
    album_type="$(printf '%s' "$album" | "$JQ_BIN" -r '.album_type')"
    release_date="$(printf '%s' "$album" | "$JQ_BIN" -r '.release_date')"
    album_track_cache_file="$(album_track_cache_path "$album_id")"

    if [[ -f "$album_track_cache_file" ]]; then
      tracks_page="$(cat "$album_track_cache_file")"
    else
      if ! tracks_page="$(spotify_get_paginated_items "/albums/$album_id/tracks" 50)"; then
        log "Skipping album after repeated failures or rate limits: $album_name"
        continue
      fi
      write_json_file "$album_track_cache_file" "$tracks_page"
    fi

    release_tracks="$(printf '%s' "$tracks_page" | "$JQ_BIN" --arg artist_id "$artist_id" --argjson album_artists "$(printf '%s' "$album" | "$JQ_BIN" '.artists // []')" '
      if any($album_artists[]?; .id == $artist_id) then
        .
      else
        map(select(any(.artists[]; .id == $artist_id)))
      end
    ')"

    if [[ "$(printf '%s' "$release_tracks" | "$JQ_BIN" 'length')" -eq 0 ]]; then
      continue
    fi

    printf '%s' "$release_tracks" | "$JQ_BIN" -c '.[]' | "$JQ_BIN" -c \
      --arg artist_id "$artist_id" \
      --arg artist_name "$artist_name" \
      --arg album_id "$album_id" \
      --arg album_name "$album_name" \
      --arg album_url "$album_url" \
      --arg release_date "$release_date" \
      --arg album_type "$album_type" \
      --argjson saved_track_count "$saved_track_count" \
      --arg window_end "$WINDOW_END_EXCLUSIVE" '
      def daynum($d): ($d + "T00:00:00Z" | fromdateiso8601) / 86400;
      {
        artist_id: $artist_id,
        artist_name: $artist_name,
        album_id: $album_id,
        album_name: $album_name,
        album_url: $album_url,
        release_date: $release_date,
        track_name: .name,
        track_uri: .uri,
        saved_track_count: $saved_track_count,
        score: (($saved_track_count * 4)
          + (10 - ((daynum($window_end) - daynum($release_date)) | floor))
          + (if $album_type == "single" then 3 else 1 end))
      }
    ' | tee -a "$artist_release_cache_file" >> "$release_candidates_file"
  done
done

if [[ ! -s "$release_candidates_file" ]]; then
  echo "No qualifying releases found from $WINDOW_START to $WINDOW_INCLUSIVE_END."
  exit 0
fi

log "Ranking release candidates..."

"$JQ_BIN" -s '
  sort_by(-.score, .release_date)
  | reduce .[] as $item (
      { track_uris: [], picks: [] };
      if (.track_uris | index($item.track_uri)) then
        .
      else
        .track_uris += [$item.track_uri]
        | .picks += [$item]
      end
    )
  | .picks
' "$release_candidates_file" > "$selected_tracks_file"

selected_count="$("$JQ_BIN" 'length' "$selected_tracks_file")"
if [[ "$selected_count" -eq 0 ]]; then
  echo "No qualifying releases found from $WINDOW_START to $WINDOW_INCLUSIVE_END."
  exit 0
fi

current_user="$(spotify_get "/me")"
user_id="$(printf '%s' "$current_user" | "$JQ_BIN" -r '.id')"

description="Auto-generated every Friday from artists with 2+ liked songs. Includes releases from $WINDOW_START to $WINDOW_INCLUSIVE_END."

playlist_id="$PLAYLIST_ID"
playlist_url=""

if [[ -n "$playlist_id" ]]; then
  playlist_response="$(spotify_get_or_skip "/playlists/$playlist_id" || true)"
  if [[ -n "$playlist_response" ]]; then
    playlist_owner_id="$(printf '%s' "$playlist_response" | "$JQ_BIN" -r '.owner.id // empty')"
    playlist_name="$(printf '%s' "$playlist_response" | "$JQ_BIN" -r '.name // empty')"
    if [[ "$playlist_owner_id" == "$user_id" && "${playlist_name:l}" == "${PLAYLIST_NAME:l}" ]]; then
      playlist_url="$(printf '%s' "$playlist_response" | "$JQ_BIN" -r '.external_urls.spotify // empty')"
    else
      playlist_id=""
    fi
  else
    playlist_id=""
  fi
fi

if [[ -z "$playlist_id" ]]; then
  log "Loading your playlists..."

  offset=0
  while :; do
    page="$(spotify_get "/me/playlists?limit=50&offset=$offset")"
    items_count="$(printf '%s' "$page" | "$JQ_BIN" '.items | length')"
    printf '%s' "$page" | "$JQ_BIN" -c '.items[]' >> "$playlists_file"
    if [[ "$items_count" -lt 50 ]]; then
      break
    fi
    offset=$((offset + items_count))
  done

  playlist_id="$("$JQ_BIN" -s -r --arg name "$PLAYLIST_NAME" --arg user_id "$user_id" '
    map(select(.owner.id == $user_id and (.name | ascii_downcase) == ($name | ascii_downcase))) | .[0].id // empty
  ' "$playlists_file")"
fi

if [[ -z "$playlist_id" ]]; then
  log "Creating playlist: $PLAYLIST_NAME"
  created_playlist="$(spotify_post_json "/users/$user_id/playlists" "$("$JQ_BIN" -n --arg name "$PLAYLIST_NAME" --arg description "$description" '{name: $name, description: $description, public: false}')")"
  playlist_id="$(printf '%s' "$created_playlist" | "$JQ_BIN" -r '.id')"
  playlist_url="$(printf '%s' "$created_playlist" | "$JQ_BIN" -r '.external_urls.spotify')"
else
  log "Updating playlist: $PLAYLIST_NAME"
  spotify_put_json "/playlists/$playlist_id" "$("$JQ_BIN" -n --arg name "$PLAYLIST_NAME" --arg description "$description" '{name: $name, description: $description, public: false}')"
  if [[ -z "$playlist_url" && -s "$playlists_file" ]]; then
    playlist_url="$("$JQ_BIN" -s -r --arg id "$playlist_id" 'map(select(.id == $id)) | .[0].external_urls.spotify // empty' "$playlists_file")"
  fi
  if [[ -z "$playlist_url" ]]; then
    playlist_response="$(spotify_get_or_skip "/playlists/$playlist_id" || true)"
    if [[ -n "$playlist_response" ]]; then
      playlist_url="$(printf '%s' "$playlist_response" | "$JQ_BIN" -r '.external_urls.spotify // empty')"
    fi
  fi
fi

write_playlist_id "$playlist_id"

first_batch="$("$JQ_BIN" '.[0:100] | map(.track_uri)' "$selected_tracks_file")"
log "Writing tracks to Spotify playlist..."
spotify_put_json "/playlists/$playlist_id/tracks" "$("$JQ_BIN" -n --argjson uris "$first_batch" '{uris: $uris}')"

remaining_batches="$("$JQ_BIN" '[range(100; length; 100)]' "$selected_tracks_file")"
remaining_batch_count="$(printf '%s' "$remaining_batches" | "$JQ_BIN" 'length')"

for (( batch_index=0; batch_index<remaining_batch_count; batch_index++ )); do
  start_index="$(printf '%s' "$remaining_batches" | "$JQ_BIN" -r ".[$batch_index]")"
  batch="$("$JQ_BIN" ".[$start_index:$start_index+100] | map(.track_uri)" "$selected_tracks_file")"
  spotify_post_json "/playlists/$playlist_id/tracks" "$("$JQ_BIN" -n --argjson uris "$batch" '{uris: $uris}')" >/dev/null
done

echo "Updated playlist: $PLAYLIST_NAME"
echo "Window: $WINDOW_START to $WINDOW_INCLUSIVE_END"
echo "Tracks added: $selected_count"
echo "Open: $playlist_url"
