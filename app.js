const storageKeys = {
  accessToken: "spotify_access_token",
  refreshToken: "spotify_refresh_token",
  expiresAt: "spotify_expires_at",
  codeVerifier: "spotify_code_verifier",
  clientId: "spotify_client_id",
  playlistId: "spotify_playlist_id",
  libraryCache: "spotify_library_cache_v1",
  libraryLatestAddedAt: "spotify_library_latest_added_at",
  libraryLastFullScanAt: "spotify_library_last_full_scan_at",
  artistDetailsCache: "spotify_artist_details_cache_v1",
  releaseCache: "spotify_release_cache_v1",
  albumTrackCache: "spotify_album_track_cache_v1",
  lastRunSummary: "spotify_last_run_summary_v1",
  batchCheckpoint: "spotify_batch_checkpoint_v1",
  rateTelemetry: "spotify_rate_telemetry_v1",
  runLog: "spotify_run_log_v1",
};

const scopes = [
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "playlist-modify-private",
  "playlist-modify-public",
];

const excludedGenreKeywords = [
  "rap",
  "hip hop",
  "hip-hop",
  "trap",
  "drill",
  "grime",
];

const cacheRetentionDays = 14;
const maxSpotifyRetries = 8;
const releaseBatchSize = 25;
const batchPauseMilliseconds = 1500;
const maxRunLogEntries = 12;

const clientIdInput = document.querySelector("#client-id");
const redirectUriInput = document.querySelector("#redirect-uri");
const connectButton = document.querySelector("#connect-button");
const disconnectButton = document.querySelector("#disconnect-button");
const generateButton = document.querySelector("#generate-button");
const prepButton = document.querySelector("#prep-button");
const resumeButton = document.querySelector("#resume-button");
const freshButton = document.querySelector("#fresh-button");
const clearCachesButton = document.querySelector("#clear-caches-button");
const playlistNameInput = document.querySelector("#playlist-name");
const statusNode = document.querySelector("#status");
const statWindow = document.querySelector("#stat-window");
const statQualifiedArtists = document.querySelector("#stat-qualified-artists");
const statReleaseCount = document.querySelector("#stat-release-count");
const statTrackCount = document.querySelector("#stat-track-count");
const statLastRun = document.querySelector("#stat-last-run");
const statCacheSize = document.querySelector("#stat-cache-size");
const checkpointStatus = document.querySelector("#checkpoint-status");
const telemetryLast429 = document.querySelector("#telemetry-last-429");
const telemetryRetryDelay = document.querySelector("#telemetry-retry-delay");
const telemetryBatch = document.querySelector("#telemetry-batch");
const runLogNode = document.querySelector("#run-log");
const profileCard = document.querySelector("#profile-card");
const nextStepCard = document.querySelector("#next-step-card");
const resultsCard = document.querySelector("#results-card");
const resultsTitle = document.querySelector("#results-title");
const resultsSummary = document.querySelector("#results-summary");
const resultsList = document.querySelector("#results-list");
const automationCard = document.querySelector("#automation-card");
const exportConfigButton = document.querySelector("#export-config-button");
const configOutput = document.querySelector("#config-output");
const profileImage = document.querySelector("#profile-image");
const displayName = document.querySelector("#display-name");
const emailNode = document.querySelector("#email");
const productNode = document.querySelector("#product");
let isRunInProgress = false;

bootstrap();

connectButton.addEventListener("click", beginLogin);
disconnectButton.addEventListener("click", disconnect);
generateButton.addEventListener("click", () => runRadar({ mode: "build", startFresh: false }));
prepButton.addEventListener("click", () => runRadar({ mode: "prep", startFresh: false }));
resumeButton.addEventListener("click", () => runRadar({ mode: "build", startFresh: false, requireCheckpoint: true }));
freshButton.addEventListener("click", () => runRadar({ mode: "build", startFresh: true }));
clearCachesButton.addEventListener("click", clearCaches);
exportConfigButton.addEventListener("click", showAutomationConfig);

async function bootstrap() {
  updateWindowStat(getActiveFridayWindow());
  updateLastRunStat();
  updateCacheFootprintStat();
  updateCheckpointStatus();
  updateRateTelemetry();
  renderRunLog();
  setRunControlsDisabled(false);
  redirectUriInput.value = `${window.location.origin}${window.location.pathname}`;
  clientIdInput.value = localStorage.getItem(storageKeys.clientId) ?? "";

  const params = new URLSearchParams(window.location.search);
  const authCode = params.get("code");
  const authError = params.get("error");

  if (authError) {
    setStatus(`Spotify sign-in failed: ${authError}`);
    window.history.replaceState({}, document.title, redirectUriInput.value);
    return;
  }

  if (authCode) {
    setStatus("Completing Spotify sign-in...");
    await exchangeCodeForToken(authCode);
    window.history.replaceState({}, document.title, redirectUriInput.value);
    return;
  }

  const storedToken = localStorage.getItem(storageKeys.accessToken);
  const expiresAt = Number(localStorage.getItem(storageKeys.expiresAt) ?? 0);

  if (storedToken && Date.now() < expiresAt) {
    const activeToken = await getValidAccessToken();
    if (activeToken) {
      await loadProfile(activeToken);
    }
    return;
  }

  if (storedToken && Date.now() >= expiresAt) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      await loadProfile(refreshedToken);
      return;
    }

    setStatus("Session expired. Please reconnect Spotify.");
    disconnect(false);
    return;
  }

  setStatus("Not connected.");
}

async function beginLogin() {
  const clientId = clientIdInput.value.trim();
  const redirectUri = redirectUriInput.value.trim();

  if (!clientId) {
    setStatus("Enter your Spotify Client ID first.");
    return;
  }

  if (!redirectUri) {
    setStatus("Enter a valid redirect URI.");
    return;
  }

  localStorage.setItem(storageKeys.clientId, clientId);

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem(storageKeys.codeVerifier, verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: scopes.join(" "),
    show_dialog: "true",
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const clientId = localStorage.getItem(storageKeys.clientId);
  const verifier = localStorage.getItem(storageKeys.codeVerifier);
  const redirectUri = redirectUriInput.value.trim();

  if (!clientId || !verifier) {
    setStatus("Missing OAuth setup. Start the connection again.");
    return;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    setStatus(data.error_description || "Spotify token exchange failed.");
    return;
  }

  persistTokenData(data);
  await loadProfile(data.access_token);
}

async function refreshAccessToken() {
  const clientId = localStorage.getItem(storageKeys.clientId);
  const refreshToken = localStorage.getItem(storageKeys.refreshToken);

  if (!clientId || !refreshToken) {
    return null;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return null;
  }

  persistTokenData({
    ...data,
    refresh_token: data.refresh_token || refreshToken,
  });

  return data.access_token;
}

async function loadProfile(accessToken) {
  setStatus("Connected. Loading your Spotify profile...");

  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const profile = await response.json();

  if (!response.ok) {
    setStatus(profile.error?.message || "Could not load Spotify profile.");
    return;
  }

  displayName.textContent = profile.display_name || "Spotify User";
  emailNode.textContent = profile.email || "";
  productNode.textContent = profile.product ? `Plan: ${profile.product}` : "Spotify account";

  if (profile.images?.[0]?.url) {
    profileImage.src = profile.images[0].url;
    profileImage.classList.remove("hidden");
  } else {
    profileImage.classList.add("hidden");
  }

  profileCard.classList.remove("hidden");
  nextStepCard.classList.remove("hidden");
  automationCard.classList.remove("hidden");
  setStatus("Spotify connected successfully.");
}

async function runRadar({ mode = "build", startFresh = false, requireCheckpoint = false } = {}) {
  if (isRunInProgress) {
    setStatus("A run is already in progress.");
    return;
  }

  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    setStatus("Connect Spotify before generating a playlist.");
    return;
  }

  const checkpoint = getBatchCheckpoint();
  if (requireCheckpoint && !checkpoint) {
    setStatus("No saved checkpoint is available to resume.");
    return;
  }

  if (startFresh) {
    clearBatchCheckpoint();
    addRunLogEntry("Fresh run requested. Ignoring any saved checkpoint.");
    renderRunLog();
  }

  isRunInProgress = true;
  setRunControlsDisabled(true);
  resetRateTelemetry();
  const playlistName = playlistNameInput.value.trim() || "Release Radar";
  const releaseWindow = getActiveFridayWindow();
  const isPrepOnly = mode === "prep";

  setStatus(
    isPrepOnly
      ? "Preparing cache from your artists and recent releases..."
      : "Collecting your artists and recent releases..."
  );
  resultsCard.classList.remove("hidden");
  resultsTitle.textContent = isPrepOnly ? "Preparing Thursday cache..." : "Building your weekly radar...";
  resultsSummary.textContent = isPrepOnly
    ? "Scanning liked songs and caching this week's releases without publishing playlist changes yet."
    : "Scanning liked songs, counting artists, and finding this week's Saturday-to-Friday releases plus featured appearances.";
  resultsList.innerHTML = "";
  configOutput.classList.add("hidden");
  updateWindowStat(releaseWindow);
  updateRadarStats({
    qualifiedArtists: 0,
    releaseCount: 0,
    trackCount: 0,
  });
  updateCacheFootprintStat();

  addRunLogEntry(
    isPrepOnly ? "Started prep-only cache run." : startFresh ? "Started fresh playlist build." : "Started playlist build."
  );
  renderRunLog();

  try {
    const profile = await spotifyGet("/me", accessToken);
    const weightedArtists = await fetchSavedLibraryArtists(accessToken);
    updateRadarStats({ qualifiedArtists: weightedArtists.length });

    if (!weightedArtists.length) {
      setStatus("No eligible artists found in your liked songs yet.");
      resultsTitle.textContent = "Not enough listening data yet";
      resultsSummary.textContent =
        "You need at least two saved songs by an artist for them to qualify.";
      return;
    }

    const releaseCandidates = await fetchReleaseCandidates(
      weightedArtists,
      accessToken,
      releaseWindow
    );
    updateRadarStats({ releaseCount: releaseCandidates.length });

    if (!releaseCandidates.length) {
      setStatus("No qualifying recent releases found this week.");
      resultsTitle.textContent = "No fresh releases found";
      resultsSummary.textContent = `Nothing from your qualifying artists was released between ${formatWindowDate(
        releaseWindow.start
      )} and ${formatWindowDate(getInclusiveWindowEnd(releaseWindow))}.`;
      return;
    }

    const tracks = pickRadarTracks(releaseCandidates);
    updateRadarStats({ trackCount: tracks.length });
    let playlist = null;
    let playlistChanged = false;

    if (!isPrepOnly) {
      playlist = await upsertPlaylist(profile.id, playlistName, accessToken, releaseWindow);
      playlistChanged = await syncPlaylistDiff(
        playlist.id,
        tracks.map((entry) => entry.track.uri),
        accessToken
      );

      renderResults(playlist, tracks, releaseWindow, playlistChanged);
      clearBatchCheckpoint();
    } else {
      resultsTitle.textContent = "Thursday prep cached successfully";
      resultsSummary.textContent = `Cached ${releaseCandidates.length} release candidates for ${formatWindowDate(
        releaseWindow.start
      )} through ${formatWindowDate(getInclusiveWindowEnd(releaseWindow))}. Playlist sync was skipped.`;
      resultsList.innerHTML = tracks
        .slice(0, 20)
        .map(
          (entry, index) => `
            <li class="result-item">
              <span class="result-rank">${index + 1}</span>
              <div class="result-copy">
                <strong>${escapeHtml(entry.track.name)}</strong>
                <span>${escapeHtml(entry.artist.name)} • ${escapeHtml(entry.album.name)}</span>
              </div>
              <div class="result-meta">
                <span class="meta-pill">${escapeHtml(entry.album.release_date)}</span>
              </div>
            </li>
          `
        )
        .join("");
    }

    persistLastRunSummary({
      playlistName: playlist?.name ?? playlistName,
      windowStart: releaseWindow.start,
      windowEnd: getInclusiveWindowEnd(releaseWindow),
      qualifiedArtists: weightedArtists.length,
      releaseCount: releaseCandidates.length,
      trackCount: tracks.length,
      playlistId: playlist?.id ?? localStorage.getItem(storageKeys.playlistId) ?? "",
      completedAt: new Date().toISOString(),
      mode,
      playlistChanged,
    });
    updateLastRunStat();
    updateCacheFootprintStat();
    updateCheckpointStatus();
    addRunLogEntry(
      isPrepOnly
        ? `Prep completed with ${releaseCandidates.length} cached release candidates.`
        : playlistChanged
          ? `Playlist synced successfully with ${tracks.length} tracks.`
          : "Playlist already matched cached picks. No rewrite needed."
    );
    renderRunLog();
    setStatus(
      isPrepOnly
        ? "Prep complete. Cached releases are ready for a later build."
        : playlistChanged
          ? `Spotify playlist synced: ${playlist.name}`
          : `Playlist already up to date: ${playlist.name}`
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not build the playlist.");
    resultsTitle.textContent = "Playlist generation failed";
    resultsSummary.textContent = "Check your Spotify app setup and try again.";
    addRunLogEntry(`Run failed: ${error.message || "Unknown error"}`);
    renderRunLog();
  } finally {
    isRunInProgress = false;
    setRunControlsDisabled(false);
    updateCheckpointStatus();
    updateRateTelemetry();
  }
}

function persistTokenData(data) {
  localStorage.setItem(storageKeys.accessToken, data.access_token);
  localStorage.setItem(
    storageKeys.expiresAt,
    String(Date.now() + (data.expires_in ?? 3600) * 1000)
  );

  if (data.refresh_token) {
    localStorage.setItem(storageKeys.refreshToken, data.refresh_token);
  }
}

async function getValidAccessToken() {
  const accessToken = localStorage.getItem(storageKeys.accessToken);
  const expiresAt = Number(localStorage.getItem(storageKeys.expiresAt) ?? 0);

  if (accessToken && Date.now() < expiresAt - 60_000) {
    return accessToken;
  }

  return refreshAccessToken();
}

async function fetchSavedLibraryArtists(accessToken) {
  setStatus("Syncing liked songs...");
  const cachedLibrary = getStoredJson(storageKeys.libraryCache, []);
  const latestCachedAddedAt = localStorage.getItem(storageKeys.libraryLatestAddedAt) ?? "";
  const libraryItems = await syncLibraryCache(cachedLibrary, latestCachedAddedAt, accessToken);
  const artistCounts = new Map();
  let processedTracks = 0;

  for (const item of libraryItems) {
    processedTracks += 1;
    if (processedTracks % 500 === 0) {
      setStatus(`Counting artists from ${processedTracks} liked songs...`);
    }

    for (const artist of item.track?.artists ?? []) {
      if (!artist?.id) {
        continue;
      }

      const current = artistCounts.get(artist.id) ?? {
        artist,
        savedTrackCount: 0,
      };
      current.savedTrackCount += 1;
      artistCounts.set(artist.id, current);
    }
  }

  const qualifyingArtists = Array.from(artistCounts.values())
    .filter((entry) => entry.savedTrackCount >= 2)
    .sort((a, b) => b.savedTrackCount - a.savedTrackCount);

  if (!qualifyingArtists.length) {
    return [];
  }

  setStatus("Hydrating artist details...");
  const detailedArtists = await hydrateArtistDetails(
    qualifyingArtists.map((entry) => entry.artist.id),
    accessToken
  );

  return qualifyingArtists
    .map((entry) => ({
      ...entry,
      artist: detailedArtists.get(entry.artist.id) || entry.artist,
    }))
    .filter((entry) => !isExcludedArtist(entry.artist));
}

async function hydrateArtistDetails(artistIds, accessToken) {
  const cache = getStoredJson(storageKeys.artistDetailsCache, {});
  const details = new Map();
  const missingArtistIds = [];

  for (const artistId of artistIds) {
    const cachedArtist = cache[artistId];
    if (cachedArtist) {
      details.set(artistId, cachedArtist);
    } else {
      missingArtistIds.push(artistId);
    }
  }

  for (let index = 0; index < missingArtistIds.length; index += 50) {
    const end = Math.min(index + 50, missingArtistIds.length);
    setStatus(`Fetching artist details ${end} of ${missingArtistIds.length}...`);
    const ids = missingArtistIds.slice(index, index + 50).join(",");
    const response = await spotifyGet(`/artists?ids=${ids}`, accessToken);

    for (const artist of response.artists ?? []) {
      if (artist?.id) {
        details.set(artist.id, artist);
        cache[artist.id] = artist;
      }
    }
  }

  setStoredJson(storageKeys.artistDetailsCache, cache);
  return details;
}

function isExcludedArtist(artist) {
  const genres = (artist?.genres ?? []).join(" ").toLowerCase();
  return excludedGenreKeywords.some((keyword) => genres.includes(keyword));
}

async function fetchReleaseCandidates(weightedArtists, accessToken, releaseWindow) {
  setStatus("Scanning recent releases...");
  const candidates = [];
  const releaseCache = getStoredJson(storageKeys.releaseCache, {});
  const albumTrackCache = getStoredJson(storageKeys.albumTrackCache, {});
  const activeWindowKey = `${releaseWindow.start}:${releaseWindow.endExclusive}`;
  const cachedWindow = releaseCache[activeWindowKey] ?? {};
  const checkpoint = getBatchCheckpoint();
  const hasMatchingCheckpoint = checkpoint?.windowKey === activeWindowKey;
  const restoredCandidates = hasMatchingCheckpoint ? checkpoint.candidates ?? [] : [];

  if (restoredCandidates.length) {
    candidates.push(...restoredCandidates);
  }

  for (
    let batchStart = hasMatchingCheckpoint ? checkpoint.nextArtistIndex ?? 0 : 0;
    batchStart < weightedArtists.length;
    batchStart += releaseBatchSize
  ) {
    const batchEnd = Math.min(batchStart + releaseBatchSize, weightedArtists.length);
    updateBatchTelemetry({
      currentBatch: Math.ceil(batchEnd / releaseBatchSize),
      batchesCompleted: Math.ceil(batchStart / releaseBatchSize),
      totalBatches: Math.ceil(weightedArtists.length / releaseBatchSize),
    });

    for (let artistIndex = batchStart; artistIndex < batchEnd; artistIndex += 1) {
      const entry = weightedArtists[artistIndex];
      setStatus(
        `Scanning releases for artist ${artistIndex + 1} of ${weightedArtists.length}: ${entry.artist.name}`
      );
      const artistId = entry.artist.id;
      const cachedCandidates = cachedWindow[artistId];

      if (cachedCandidates) {
        candidates.push(
          ...cachedCandidates.map((candidate) => ({
            ...candidate,
            artist: entry.artist,
            savedTrackCount: entry.savedTrackCount,
            score: scoreRelease(
              candidate.track,
              candidate.album,
              entry.savedTrackCount,
              releaseWindow
            ),
          }))
        );
        continue;
      }

      const artistCandidates = [];
      let albumsResponse;

      try {
        albumsResponse = await spotifyGet(
          `/artists/${artistId}/albums?include_groups=album,single,appears_on&limit=50`,
          accessToken
        );
      } catch (error) {
        console.warn(`Skipping artist ${entry.artist.name}`, error);
        continue;
      }

      const seenAlbumIds = new Set();
      const releases = (albumsResponse.items ?? []).filter((album) => {
        if (!album?.id || seenAlbumIds.has(album.id)) {
          return false;
        }

        seenAlbumIds.add(album.id);

        if (album.release_date_precision !== "day") {
          return false;
        }

        return isWithinWindow(album.release_date, releaseWindow);
      });

      for (const album of releases) {
        let tracks;

        try {
          tracks = await getAlbumTracks(album.id, accessToken, albumTrackCache);
        } catch (error) {
          console.warn(`Skipping album ${album.name}`, error);
          continue;
        }

        const relevantTracks = selectRelevantTracks(tracks, artistId, album);

        for (const track of relevantTracks) {
          const candidate = {
            artist: entry.artist,
            savedTrackCount: entry.savedTrackCount,
            album,
            track,
            score: scoreRelease(track, album, entry.savedTrackCount, releaseWindow),
            releaseDate: album.release_date,
            isFeaturedAppearance: album.album_group === "appears_on",
          };

          artistCandidates.push(candidate);
          candidates.push(candidate);
        }
      }

      cachedWindow[artistId] = artistCandidates.map((candidate) => ({
        album: candidate.album,
        track: candidate.track,
        releaseDate: candidate.releaseDate,
        isFeaturedAppearance: candidate.isFeaturedAppearance,
      }));
    }

    releaseCache[activeWindowKey] = cachedWindow;
    pruneReleaseCache(releaseCache);
    setStoredJson(storageKeys.releaseCache, releaseCache);
    setStoredJson(storageKeys.albumTrackCache, albumTrackCache);
    setBatchCheckpoint({
      windowKey: activeWindowKey,
      nextArtistIndex: batchEnd,
      candidates: candidates.map((candidate) => serializeCandidate(candidate)),
    });
    updateCheckpointStatus();
    updateBatchTelemetry({
      currentBatch: Math.ceil(batchEnd / releaseBatchSize),
      batchesCompleted: Math.ceil(batchEnd / releaseBatchSize),
      totalBatches: Math.ceil(weightedArtists.length / releaseBatchSize),
    });

    if (batchEnd < weightedArtists.length) {
      setStatus(
        `Completed batch ${Math.ceil(batchEnd / releaseBatchSize)} of ${Math.ceil(
          weightedArtists.length / releaseBatchSize
        )}. Pausing before next chunk...`
      );
      await wait(batchPauseMilliseconds);
    }
  }

  releaseCache[activeWindowKey] = cachedWindow;
  pruneReleaseCache(releaseCache);
  setStoredJson(storageKeys.releaseCache, releaseCache);
  setStoredJson(storageKeys.albumTrackCache, albumTrackCache);
  return candidates;
}

function selectRelevantTracks(tracks, artistId, album) {
  if (album.album_group !== "appears_on") {
    return tracks;
  }

  return tracks.filter((track) =>
    (track.artists ?? []).some((artist) => artist.id === artistId)
  );
}

function scoreRelease(track, album, savedTrackCount, releaseWindow) {
  const daysFreshness = getDayDifference(
    releaseWindow.endExclusive,
    `${album.release_date}T00:00:00`
  );
  const freshnessScore = Math.max(1, 10 - daysFreshness);
  const formatBonus = album.album_type === "single" ? 3 : 1;

  return savedTrackCount * 4 + freshnessScore + formatBonus;
}

function pickRadarTracks(releaseCandidates) {
  const selectedUris = new Set();

  return [...releaseCandidates]
    .sort((a, b) => b.score - a.score || a.releaseDate.localeCompare(b.releaseDate))
    .filter((entry) => {
      if (!entry.track?.uri || selectedUris.has(entry.track.uri)) {
        return false;
      }

      selectedUris.add(entry.track.uri);
      return true;
    });
}

async function upsertPlaylist(userId, playlistName, accessToken, releaseWindow) {
  const existingPlaylist = await findExistingPlaylist(userId, playlistName, accessToken);
  const description = `Auto-generated every Friday from artists with 2+ liked songs. Includes releases from ${releaseWindow.start} to ${getInclusiveWindowEnd(
    releaseWindow
  )}.`;

  if (!existingPlaylist) {
    const createdPlaylist = await spotifyPost(
      `/users/${userId}/playlists`,
      {
        name: playlistName,
        description,
        public: false,
      },
      accessToken
    );

    localStorage.setItem(storageKeys.playlistId, createdPlaylist.id);
    return createdPlaylist;
  }

  await spotifyPut(
    `/playlists/${existingPlaylist.id}`,
    {
      name: playlistName,
      description,
      public: false,
    },
    accessToken
  );

  localStorage.setItem(storageKeys.playlistId, existingPlaylist.id);
  return existingPlaylist;
}

async function findExistingPlaylist(userId, playlistName, accessToken) {
  const storedPlaylistId = localStorage.getItem(storageKeys.playlistId);

  if (storedPlaylistId) {
    try {
      const storedPlaylist = await spotifyGet(`/playlists/${storedPlaylistId}`, accessToken);
      if (
        storedPlaylist?.owner?.id === userId &&
        storedPlaylist.name?.toLowerCase() === playlistName.toLowerCase()
      ) {
        return storedPlaylist;
      }
    } catch (error) {
      localStorage.removeItem(storageKeys.playlistId);
    }
  }

  let offset = 0;

  while (true) {
    const page = await spotifyGet(`/me/playlists?limit=50&offset=${offset}`, accessToken);
    const match = (page.items ?? []).find(
      (playlist) =>
        playlist.owner?.id === userId &&
        playlist.name?.toLowerCase() === playlistName.toLowerCase()
    );

    if (match) {
      return match;
    }

    if (!page.items?.length || page.items.length < 50) {
      return null;
    }

    offset += page.items.length;
  }
}

async function replacePlaylistTracks(playlistId, uris, accessToken) {
  const firstBatch = uris.slice(0, 100);
  await spotifyPut(`/playlists/${playlistId}/tracks`, { uris: firstBatch }, accessToken);

  for (let index = 100; index < uris.length; index += 100) {
    const batch = uris.slice(index, index + 100);
    await spotifyPost(`/playlists/${playlistId}/tracks`, { uris: batch }, accessToken);
  }
}

async function syncPlaylistDiff(playlistId, nextUris, accessToken) {
  const currentUris = await getPlaylistTrackUris(playlistId, accessToken);
  if (arraysEqual(currentUris, nextUris)) {
    return false;
  }

  await replacePlaylistTracks(playlistId, nextUris, accessToken);
  return true;
}

async function getPlaylistTrackUris(playlistId, accessToken) {
  const uris = [];
  let offset = 0;

  while (true) {
    const page = await spotifyGet(
      `/playlists/${playlistId}/tracks?fields=items(track(uri)),next,total&limit=100&offset=${offset}`,
      accessToken
    );
    const items = page.items ?? [];
    uris.push(...items.map((item) => item.track?.uri).filter(Boolean));

    if (items.length < 100) {
      break;
    }

    offset += items.length;
  }

  return uris;
}

function renderResults(playlist, tracks, releaseWindow, playlistChanged = true) {
  resultsCard.classList.remove("hidden");
  resultsTitle.textContent = playlist?.external_urls?.spotify
    ? `Playlist ready: ${playlist.name}`
    : playlist.name;
  resultsSummary.innerHTML = `Updated for <strong>${formatWindowDate(
    releaseWindow.start
  )}</strong> through <strong>${formatWindowDate(
    getInclusiveWindowEnd(releaseWindow)
  )}</strong>. ${playlistChanged ? "Changes were synced to Spotify." : "Spotify already matched this set of picks."} ${
    playlist?.external_urls?.spotify
      ? `<a href="${playlist.external_urls.spotify}" target="_blank" rel="noreferrer">Open playlist</a>`
      : ""
  }`;

  resultsList.innerHTML = tracks
    .map(
      (entry, index) => `
        <li class="result-item">
          <span class="result-rank">${index + 1}</span>
          <div class="result-copy">
            <strong>${escapeHtml(entry.track.name)}</strong>
            <span>${escapeHtml(entry.artist.name)} • ${escapeHtml(entry.album.name)}</span>
          </div>
          <div class="result-meta">
            <span class="meta-pill">${escapeHtml(entry.album.release_date)}</span>
            <span class="meta-pill">Score ${entry.score}</span>
          </div>
        </li>
      `
    )
    .join("");
}

function showAutomationConfig() {
  const clientId = localStorage.getItem(storageKeys.clientId);
  const refreshToken = localStorage.getItem(storageKeys.refreshToken);
  const playlistId = localStorage.getItem(storageKeys.playlistId);
  const playlistName = playlistNameInput.value.trim() || "Release Radar";

  if (!clientId || !refreshToken) {
    setStatus("Connect Spotify first so the refresh token can be exported.");
    return;
  }

  const config = {
    client_id: clientId,
    refresh_token: refreshToken,
    playlist_name: playlistName,
    minimum_saved_tracks_per_artist: 2,
  };

  if (playlistId) {
    config.playlist_id = playlistId;
  }

  configOutput.textContent = JSON.stringify(config, null, 2);
  configOutput.classList.remove("hidden");
  setStatus("Automation config ready to copy into .release-radar.json.");
}

function disconnect(clearClientId = true) {
  localStorage.removeItem(storageKeys.accessToken);
  localStorage.removeItem(storageKeys.refreshToken);
  localStorage.removeItem(storageKeys.expiresAt);
  localStorage.removeItem(storageKeys.codeVerifier);

  if (clearClientId) {
    localStorage.removeItem(storageKeys.clientId);
    clientIdInput.value = "";
  }

  profileCard.classList.add("hidden");
  nextStepCard.classList.add("hidden");
  automationCard.classList.add("hidden");
  resultsCard.classList.add("hidden");
  configOutput.classList.add("hidden");
  resultsList.innerHTML = "";
  updateRadarStats({
    qualifiedArtists: 0,
    releaseCount: 0,
    trackCount: 0,
  });
  updateLastRunStat();
  updateCacheFootprintStat();
  updateCheckpointStatus();
  updateRateTelemetry();
  setStatus("Not connected.");
}

function clearCaches() {
  if (isRunInProgress) {
    setStatus("Wait for the current run to finish before clearing caches.");
    return;
  }

  for (const key of [
    storageKeys.libraryCache,
    storageKeys.libraryLatestAddedAt,
    storageKeys.libraryLastFullScanAt,
    storageKeys.artistDetailsCache,
    storageKeys.releaseCache,
    storageKeys.albumTrackCache,
    storageKeys.batchCheckpoint,
    storageKeys.rateTelemetry,
  ]) {
    localStorage.removeItem(key);
  }

  updateCacheFootprintStat();
  updateCheckpointStatus();
  updateRateTelemetry();
  addRunLogEntry("Cleared local caches and checkpoint state.");
  renderRunLog();
  setStatus("Local caches cleared.");
}

async function spotifyGet(path, accessToken) {
  return spotifyRequest(path, { method: "GET" }, accessToken);
}

async function spotifyPost(path, body, accessToken) {
  return spotifyRequest(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    accessToken
  );
}

async function spotifyPut(path, body, accessToken) {
  return spotifyRequest(
    path,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    accessToken
  );
}

async function spotifyRequest(path, init, accessToken) {
  let attempt = 0;
  let activeToken = accessToken;

  while (attempt < maxSpotifyRetries) {
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${activeToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 204) {
      return null;
    }

    if (response.status === 401 && attempt === 0) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        activeToken = refreshedToken;
        attempt += 1;
        continue;
      }
    }

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? 5);
      recordRateLimitEvent(retryAfterSeconds, path);
      await wait(Math.max(5, retryAfterSeconds) * 1000);
      attempt += 1;
      continue;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Spotify API request failed.");
    }

    return data;
  }

  throw new Error("Spotify API kept rate limiting requests. Please try again shortly.");
}

function updateWindowStat(windowRange) {
  statWindow.textContent = `${formatWindowDate(windowRange.start)} to ${formatWindowDate(
    getInclusiveWindowEnd(windowRange)
  )}`;
}

function updateRadarStats({ qualifiedArtists, releaseCount, trackCount }) {
  if (typeof qualifiedArtists === "number") {
    statQualifiedArtists.textContent = String(qualifiedArtists);
  }

  if (typeof releaseCount === "number") {
    statReleaseCount.textContent = String(releaseCount);
  }

  if (typeof trackCount === "number") {
    statTrackCount.textContent = String(trackCount);
  }
}

function updateLastRunStat() {
  const summary = getStoredJson(storageKeys.lastRunSummary, null);

  if (!summary?.completedAt) {
    statLastRun.textContent = "Never";
    return;
  }

  statLastRun.textContent = formatDateTime(summary.completedAt);
}

function updateCacheFootprintStat() {
  const libraryCount = getStoredJson(storageKeys.libraryCache, []).length;
  const artistCount = Object.keys(getStoredJson(storageKeys.artistDetailsCache, {})).length;
  const albumCount = Object.keys(getStoredJson(storageKeys.albumTrackCache, {})).length;
  statCacheSize.textContent = `${libraryCount} tracks, ${artistCount} artists, ${albumCount} albums`;
}

function updateCheckpointStatus() {
  const checkpoint = getBatchCheckpoint();
  if (!checkpoint?.windowKey) {
    checkpointStatus.textContent = "No saved checkpoint.";
    if (!isRunInProgress) {
      resumeButton.disabled = true;
    }
    return;
  }

  checkpointStatus.textContent = `Checkpoint saved for ${checkpoint.windowKey} at artist ${checkpoint.nextArtistIndex}.`;
  if (!isRunInProgress) {
    resumeButton.disabled = false;
  }
}

function updateRateTelemetry() {
  const telemetry = getStoredJson(storageKeys.rateTelemetry, {});
  telemetryLast429.textContent = telemetry.last429At
    ? `Last 429 at ${formatDateTime(telemetry.last429At)} on ${telemetry.lastPath ?? "Spotify request"}.`
    : "No 429s recorded.";
  telemetryRetryDelay.textContent = telemetry.retryDelaySeconds
    ? `Retry delay: ${telemetry.retryDelaySeconds}s`
    : "No retry delay active.";
  telemetryBatch.textContent = telemetry.totalBatches
    ? `Batch ${telemetry.currentBatch ?? 0}/${telemetry.totalBatches}, completed ${telemetry.batchesCompleted ?? 0}.`
    : "No batch started.";
}

function updateBatchTelemetry({ currentBatch, batchesCompleted, totalBatches }) {
  const telemetry = getStoredJson(storageKeys.rateTelemetry, {});
  telemetry.currentBatch = currentBatch;
  telemetry.batchesCompleted = batchesCompleted;
  telemetry.totalBatches = totalBatches;
  setStoredJson(storageKeys.rateTelemetry, telemetry);
  updateRateTelemetry();
}

function resetRateTelemetry() {
  setStoredJson(storageKeys.rateTelemetry, {});
  updateRateTelemetry();
}

function recordRateLimitEvent(retryDelaySeconds, path) {
  const telemetry = getStoredJson(storageKeys.rateTelemetry, {});
  telemetry.last429At = new Date().toISOString();
  telemetry.retryDelaySeconds = retryDelaySeconds;
  telemetry.lastPath = path;
  setStoredJson(storageKeys.rateTelemetry, telemetry);
  addRunLogEntry(`Rate limited on ${path}. Waiting ${retryDelaySeconds}s before retry.`);
  updateRateTelemetry();
  renderRunLog();
}

function renderRunLog() {
  const logEntries = getStoredJson(storageKeys.runLog, []);
  if (!logEntries.length) {
    runLogNode.innerHTML = '<li class="result-item"><div class="result-copy"><strong>No runs yet</strong><span>Your recent attempts will show up here.</span></div></li>';
    return;
  }

  runLogNode.innerHTML = logEntries
    .map(
      (entry, index) => `
        <li class="result-item">
          <span class="result-rank">${logEntries.length - index}</span>
          <div class="result-copy">
            <strong>${escapeHtml(entry.message)}</strong>
            <span>${escapeHtml(formatDateTime(entry.at))}</span>
          </div>
        </li>
      `
    )
    .join("");
}

function addRunLogEntry(message) {
  const logEntries = getStoredJson(storageKeys.runLog, []);
  logEntries.unshift({
    at: new Date().toISOString(),
    message,
  });
  setStoredJson(storageKeys.runLog, logEntries.slice(0, maxRunLogEntries));
}

function setRunControlsDisabled(disabled) {
  generateButton.disabled = disabled;
  prepButton.disabled = disabled;
  resumeButton.disabled = disabled || !getBatchCheckpoint();
  freshButton.disabled = disabled;
  clearCachesButton.disabled = disabled;
}

function setStatus(message) {
  statusNode.textContent = message;
}

function getActiveFridayWindow() {
  const now = new Date();
  const friday = new Date(now);
  const day = friday.getDay();
  const daysUntilFriday = (5 - day + 7) % 7;

  friday.setHours(0, 0, 0, 0);
  friday.setDate(friday.getDate() + daysUntilFriday);

  const start = new Date(friday);
  start.setDate(friday.getDate() - 6);

  const endExclusive = new Date(friday);
  endExclusive.setDate(friday.getDate() + 1);

  return {
    start: toDateString(start),
    endExclusive: toDateString(endExclusive),
  };
}

function getInclusiveWindowEnd(windowRange) {
  const end = new Date(`${windowRange.endExclusive}T00:00:00`);
  end.setDate(end.getDate() - 1);
  return toDateString(end);
}

function formatWindowDate(dateString) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function formatDateTime(dateString) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function isWithinWindow(dateString, releaseWindow) {
  return (
    dateString >= releaseWindow.start && dateString < releaseWindow.endExclusive
  );
}

function getDayDifference(laterDateString, earlierDateString) {
  const later = new Date(laterDateString);
  const earlier = new Date(earlierDateString);
  return Math.floor((later - earlier) / 86_400_000);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function generateCodeVerifier() {
  const values = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(values);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function syncLibraryCache(cachedLibrary, latestCachedAddedAt, accessToken) {
  if (!Array.isArray(cachedLibrary) || !cachedLibrary.length || shouldRunFullLibraryScan()) {
    return fullLibraryScan(accessToken);
  }

  let offset = 0;
  let shouldContinue = true;
  let newestSeenAddedAt = latestCachedAddedAt;
  const newEntries = [];

  while (shouldContinue) {
    const page = await spotifyGet(`/me/tracks?limit=50&offset=${offset}`, accessToken);
    const items = page.items ?? [];

    if (!items.length) {
      break;
    }

    if (!newestSeenAddedAt && items[0]?.added_at) {
      newestSeenAddedAt = items[0].added_at;
    }

    for (const item of items) {
      if (latestCachedAddedAt && item.added_at <= latestCachedAddedAt) {
        shouldContinue = false;
        break;
      }

      newEntries.push(simplifyLibraryItem(item));
    }

    if (items.length < 50) {
      shouldContinue = false;
    } else {
      offset += items.length;
    }
  }

  if (!newEntries.length) {
    return cachedLibrary;
  }

  const mergedLibrary = dedupeLibraryItems([...newEntries, ...cachedLibrary]);
  setStoredJson(storageKeys.libraryCache, mergedLibrary);

  if (newestSeenAddedAt) {
    localStorage.setItem(storageKeys.libraryLatestAddedAt, newestSeenAddedAt);
  }

  return mergedLibrary;
}

async function fullLibraryScan(accessToken) {
  let offset = 0;
  let latestAddedAt = "";
  const items = [];

  while (true) {
    const page = await spotifyGet(`/me/tracks?limit=50&offset=${offset}`, accessToken);
    const pageItems = page.items ?? [];

    if (!pageItems.length) {
      break;
    }

    if (!latestAddedAt && pageItems[0]?.added_at) {
      latestAddedAt = pageItems[0].added_at;
    }

    items.push(...pageItems.map(simplifyLibraryItem));

    if (pageItems.length < 50) {
      break;
    }

    offset += pageItems.length;
  }

  const dedupedItems = dedupeLibraryItems(items);
  setStoredJson(storageKeys.libraryCache, dedupedItems);
  localStorage.setItem(storageKeys.libraryLastFullScanAt, String(Date.now()));

  if (latestAddedAt) {
    localStorage.setItem(storageKeys.libraryLatestAddedAt, latestAddedAt);
  }

  return dedupedItems;
}

function simplifyLibraryItem(item) {
  return {
    added_at: item.added_at,
    track: {
      id: item.track?.id ?? "",
      artists: (item.track?.artists ?? []).map((artist) => ({
        id: artist.id,
        name: artist.name,
      })),
    },
  };
}

function dedupeLibraryItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = `${item.track?.id ?? ""}|${item.added_at ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function getAlbumTracks(albumId, accessToken, albumTrackCache) {
  if (albumTrackCache[albumId]) {
    return albumTrackCache[albumId];
  }

  const tracks = [];
  let offset = 0;

  while (true) {
    const page = await spotifyGet(`/albums/${albumId}/tracks?limit=50&offset=${offset}`, accessToken);
    const items = page.items ?? [];
    tracks.push(...items);

    if (items.length < 50) {
      break;
    }

    offset += items.length;
  }

  albumTrackCache[albumId] = tracks;
  return tracks;
}

function shouldRunFullLibraryScan() {
  const lastFullScanAt = Number(localStorage.getItem(storageKeys.libraryLastFullScanAt) ?? 0);
  if (!lastFullScanAt) {
    return true;
  }

  return Date.now() - lastFullScanAt >= cacheRetentionDays * 86_400_000;
}

function pruneReleaseCache(releaseCache) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cacheRetentionDays);

  for (const key of Object.keys(releaseCache)) {
    const windowStart = key.split(":")[0];
    const date = new Date(`${windowStart}T00:00:00`);
    if (date < cutoff) {
      delete releaseCache[key];
    }
  }
}

function getStoredJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function setStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not persist ${key}`, error);
  }
}

function persistLastRunSummary(summary) {
  setStoredJson(storageKeys.lastRunSummary, summary);
}

function getBatchCheckpoint() {
  return getStoredJson(storageKeys.batchCheckpoint, null);
}

function setBatchCheckpoint(checkpoint) {
  setStoredJson(storageKeys.batchCheckpoint, checkpoint);
}

function clearBatchCheckpoint() {
  localStorage.removeItem(storageKeys.batchCheckpoint);
  updateCheckpointStatus();
}

function serializeCandidate(candidate) {
  return {
    artist: {
      id: candidate.artist.id,
      name: candidate.artist.name,
    },
    savedTrackCount: candidate.savedTrackCount,
    album: candidate.album,
    track: candidate.track,
    score: candidate.score,
    releaseDate: candidate.releaseDate,
    isFeaturedAppearance: candidate.isFeaturedAppearance,
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
