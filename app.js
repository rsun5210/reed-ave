const storageKeys = {
  appStorageVersion: "spotify_app_storage_version",
  accessToken: "spotify_access_token",
  refreshToken: "spotify_refresh_token",
  expiresAt: "spotify_expires_at",
  codeVerifier: "spotify_code_verifier",
  clientId: "spotify_client_id",
  genreFilterEnabled: "spotify_genre_filter_enabled",
  safeModeEnabled: "spotify_safe_mode_enabled",
  setupCollapsed: "spotify_setup_collapsed",
  playlistId: "spotify_playlist_id",
  libraryCache: "spotify_library_cache_v1",
  libraryLatestAddedAt: "spotify_library_latest_added_at",
  libraryLastFullScanAt: "spotify_library_last_full_scan_at",
  qualifiedArtistsCache: "spotify_qualified_artists_cache_v1",
  artistDetailsCache: "spotify_artist_details_cache_v1",
  releaseCache: "spotify_release_cache_v4",
  albumTrackCache: "spotify_album_track_cache_v1",
  lastRunSummary: "spotify_last_run_summary_v1",
  batchCheckpoint: "spotify_batch_checkpoint_v1",
  rateTelemetry: "spotify_rate_telemetry_v1",
  runLog: "spotify_run_log_v1",
};

const appStorageVersion = "2026-04-24-cache-reset-1";

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
const maxNetworkRetries = 3;
const networkRetryDelayMilliseconds = 1500;
const spotifyRequestSpacingMilliseconds = 1000;
const spotifyRequestSpacingOn429Milliseconds = 5000;
const releaseBatchSize = 5;
const batchPauseMilliseconds = 5000;
const maxRunLogEntries = 12;
const artistDetailsBatchSize = 10;
const artistDetailsPauseMilliseconds = 1500;
const artistReleaseSpacingMilliseconds = 1200;
const albumReleaseSpacingMilliseconds = 900;

const standardRunTuning = {
  label: "Standard pacing",
  requestSpacingMilliseconds: spotifyRequestSpacingMilliseconds,
  requestSpacingOn429Milliseconds: spotifyRequestSpacingOn429Milliseconds,
  releaseBatchSize,
  batchPauseMilliseconds,
  artistDetailsBatchSize,
  artistDetailsPauseMilliseconds,
  artistReleaseSpacingMilliseconds,
  albumReleaseSpacingMilliseconds,
};

const safeRunTuning = {
  label: "Safe mode pacing",
  requestSpacingMilliseconds: 1600,
  requestSpacingOn429Milliseconds: 7000,
  releaseBatchSize: 3,
  batchPauseMilliseconds: 7000,
  artistDetailsBatchSize: 5,
  artistDetailsPauseMilliseconds: 2200,
  artistReleaseSpacingMilliseconds: 2200,
  albumReleaseSpacingMilliseconds: 1500,
};

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
const genreFilterEnabledInput = document.querySelector("#genre-filter-enabled");
const safeModeEnabledInput = document.querySelector("#safe-mode-enabled");
const setupCard = document.querySelector("#setup-card");
const setupCardBody = document.querySelector("#setup-card-body");
const setupToggleButton = document.querySelector("#setup-toggle-button");
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
const runStatePanel = document.querySelector("#run-state-panel");
const runPhaseLabel = document.querySelector("#run-phase-label");
const runTuningLabel = document.querySelector("#run-tuning-label");
const runModeLabel = document.querySelector("#run-mode-label");
const runProgressLabel = document.querySelector("#run-progress-label");
const runPhaseDetail = document.querySelector("#run-phase-detail");
const runProgressFill = document.querySelector("#run-progress-fill");
const settingsStrip = document.querySelector("#settings-strip");
const settingsMode = document.querySelector("#settings-mode");
const settingsPlaylist = document.querySelector("#settings-playlist");
const settingsFilter = document.querySelector("#settings-filter");
const settingsSafeMode = document.querySelector("#settings-safe-mode");
const settingsWindowPill = document.querySelector("#settings-window-pill");
const lastPlaylistLink = document.querySelector("#last-playlist-link");
const automationCard = document.querySelector("#automation-card");
const exportConfigButton = document.querySelector("#export-config-button");
const configOutput = document.querySelector("#config-output");
const profileImage = document.querySelector("#profile-image");
const displayName = document.querySelector("#display-name");
const emailNode = document.querySelector("#email");
const productNode = document.querySelector("#product");
let isRunInProgress = false;
let nextSpotifyRequestAt = 0;
let currentSpotifyRequestSpacingMilliseconds = spotifyRequestSpacingMilliseconds;
let currentRunTuning = standardRunTuning;

bootstrap();

connectButton.addEventListener("click", beginLogin);
disconnectButton.addEventListener("click", disconnect);
generateButton.addEventListener("click", () => runRadar({ mode: "build", startFresh: false }));
prepButton.addEventListener("click", () => runRadar({ mode: "prep", startFresh: false }));
resumeButton.addEventListener("click", () => runRadar({ mode: "build", startFresh: false, requireCheckpoint: true }));
freshButton.addEventListener("click", () => runRadar({ mode: "build", startFresh: true }));
clearCachesButton.addEventListener("click", clearCaches);
exportConfigButton.addEventListener("click", showAutomationConfig);
genreFilterEnabledInput.addEventListener("change", () => {
  persistGenreFilterPreference();
  updateSettingsSummary();
});
safeModeEnabledInput.addEventListener("change", () => {
  persistSafeModePreference();
  updateSettingsSummary();
});
playlistNameInput.addEventListener("input", updateSettingsSummary);
setupToggleButton.addEventListener("click", toggleSetupCard);

async function bootstrap() {
  try {
    ensureCurrentStorageVersion();
    updateWindowStat(getActiveFridayWindow());
    updateLastRunStat();
    updateCacheFootprintStat();
    updateCheckpointStatus();
    updateRateTelemetry();
    renderRunLog();
    setRunControlsDisabled(false);
    redirectUriInput.value = `${window.location.origin}${window.location.pathname}`;
    clientIdInput.value = localStorage.getItem(storageKeys.clientId) ?? "";
    genreFilterEnabledInput.checked = isGenreFilterEnabled();
    safeModeEnabledInput.checked = isSafeModeEnabled();
    updateSettingsSummary();
    updateLastPlaylistLink();
    applySetupCardState();

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
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not finish loading Spotify state.");
  }
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

  let response;

  try {
    response = await fetchWithNetworkRetries(
      "https://accounts.spotify.com/api/token",
      {
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
      },
      "Spotify sign-in"
    );
  } catch (error) {
    setStatus(error.message || "Spotify sign-in could not be completed.");
    return;
  }

  const data = await safeParseJson(response);

  if (!response.ok) {
    setStatus(getSpotifyErrorMessage(data, "Spotify token exchange failed."));
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

  let response;

  try {
    response = await fetchWithNetworkRetries(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
      "Spotify session refresh"
    );
  } catch (error) {
    setStatus(error.message || "Spotify session refresh failed.");
    return null;
  }

  const data = await safeParseJson(response);

  if (!response.ok || !data?.access_token) {
    if (data?.error === "invalid_grant") {
      disconnect(false);
      setStatus("Spotify session expired or was revoked. Reconnect Spotify to keep going.");
    }
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

  let response;

  try {
    response = await fetchWithNetworkRetries(
      "https://api.spotify.com/v1/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      "Spotify profile load"
    );
  } catch (error) {
    setStatus(error.message || "Could not load Spotify profile.");
    return;
  }

  const profile = await safeParseJson(response);

  if (!response.ok) {
    setStatus(profile?.error?.message || "Could not load Spotify profile.");
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
  setupToggleButton.classList.remove("hidden");
  applySetupCardState();
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
  const runTuning = getRunTuning();
  const playlistName = playlistNameInput.value.trim() || "Release Radar";
  const releaseWindow = getActiveFridayWindow();
  const isPrepOnly = mode === "prep";
  const activeRunModeLabel = getRunModeLabel({ mode, startFresh, requireCheckpoint });

  setStatus(
    isPrepOnly
      ? "Preparing cache from your artists and recent releases..."
      : "Collecting your artists and recent releases..."
  );
  updateSettingsSummary({ runModeLabel: activeRunModeLabel, releaseWindow, runTuning });
  resultsCard.classList.remove("hidden");
  renderRunState({
    visible: true,
    modeLabel: activeRunModeLabel,
    phaseLabel: "Phase 1 of 4",
    tuningLabel: runTuning.label,
    progressLabel: isPrepOnly ? "Preparing cache and release data..." : "Starting full playlist build...",
    phaseDetail: "Library sync starts first, then artist prep, release scanning, and playlist sync.",
    percent: 6,
  });
  resultsTitle.textContent = isPrepOnly ? "Preparing Thursday cache..." : "Building your weekly radar...";
  resultsSummary.textContent = isPrepOnly
    ? "Scanning liked songs and caching this week's releases without publishing playlist changes yet."
    : "Scanning liked songs, counting artists, and finding this week's Saturday-to-Friday releases plus featured appearances.";
  renderResultsPlaceholder("Run in progress. Progress details will appear here as the scan moves forward.");
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
  resetSpotifyRequestThrottle(runTuning);

  try {
    const resumedCheckpoint = getBatchCheckpoint();
    if (requireCheckpoint && resumedCheckpoint?.phase) {
      addRunLogEntry(`Resuming from ${describeCheckpointPhase(resumedCheckpoint)}.`);
      renderRunLog();
    }
    const profile = await spotifyGet("/me", accessToken);
    setBatchCheckpoint({
      phase: "library-sync",
      detail: "Syncing liked songs and refreshing reusable local cache.",
      windowKey: `${releaseWindow.start}:${releaseWindow.endExclusive}`,
      nextArtistIndex: 0,
      candidates: [],
    });
    renderRunState({
      visible: true,
      modeLabel: activeRunModeLabel,
      phaseLabel: "Phase 1 of 4",
      tuningLabel: runTuning.label,
      progressLabel: "Reading your Spotify profile and liked songs...",
      phaseDetail: "This phase rebuilds reusable library state so later retries do much less work.",
      percent: 14,
    });
    const weightedArtists = await fetchSavedLibraryArtists(accessToken, runTuning, releaseWindow);
    updateRadarStats({ qualifiedArtists: weightedArtists.length });
    renderRunState({
      visible: true,
      modeLabel: activeRunModeLabel,
      phaseLabel: "Phase 2 of 4",
      tuningLabel: runTuning.label,
      progressLabel: `Found ${weightedArtists.length} qualifying artists.`,
      phaseDetail: "Artist metadata is cached as it loads, so a resume can restart with warmer state.",
      percent: 34,
    });

    if (!weightedArtists.length) {
      setStatus("No eligible artists found in your liked songs yet.");
      renderEmptyResults({
        title: "Not enough listening data yet",
        summary: "You need at least two saved songs by an artist for them to qualify.",
        detail: "Save a little more music from the artists you want represented, then run the radar again.",
      });
      return;
    }

    const releaseCandidates = await fetchReleaseCandidates(
      weightedArtists,
      accessToken,
      releaseWindow,
      runTuning
    );
    updateRadarStats({ releaseCount: releaseCandidates.length });
    renderRunState({
      visible: true,
      modeLabel: activeRunModeLabel,
      phaseLabel: "Phase 3 of 4",
      tuningLabel: runTuning.label,
      progressLabel: `Scanned this week's releases and found ${releaseCandidates.length} matches.`,
      phaseDetail: "Release scanning checkpoints after each artist batch so Resume can continue from the last saved chunk.",
      percent: 74,
    });

    if (!releaseCandidates.length) {
      setStatus("No qualifying recent releases found this week.");
      renderEmptyResults({
        title: "No fresh releases found",
        summary: `Nothing from your qualifying artists was released between ${formatWindowDate(
          releaseWindow.start
        )} and ${formatWindowDate(getInclusiveWindowEnd(releaseWindow))}.`,
        detail: "Try again next Friday, or loosen the genre filter if you want a broader scan.",
      });
      return;
    }

    const tracks = pickRadarTracks(releaseCandidates);
    updateRadarStats({ trackCount: tracks.length });
    let playlist = null;
    let playlistChanged = false;

    if (!isPrepOnly) {
      renderRunState({
        visible: true,
        modeLabel: activeRunModeLabel,
        phaseLabel: "Phase 4 of 4",
        tuningLabel: runTuning.label,
        progressLabel: `Preparing to sync ${tracks.length} playlist tracks to Spotify...`,
        phaseDetail: "Final phase: updating your Spotify playlist while keeping the warmed cache in place.",
        percent: 88,
      });
      setBatchCheckpoint({
        phase: "playlist-sync",
        detail: `Ready to sync ${tracks.length} ranked tracks to Spotify.`,
        windowKey: `${releaseWindow.start}:${releaseWindow.endExclusive}`,
        nextArtistIndex: weightedArtists.length,
        candidates: releaseCandidates.map((candidate) => serializeCandidate(candidate)),
        totalArtists: weightedArtists.length,
        processedArtists: weightedArtists.length,
      });
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
      renderTrackList(tracks.slice(0, 20), { showScore: false });
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
    updateLastPlaylistLink();
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
    renderRunState({
      visible: true,
      modeLabel: activeRunModeLabel,
      phaseLabel: isPrepOnly ? "Prep complete" : "All phases complete",
      tuningLabel: runTuning.label,
      progressLabel: isPrepOnly
        ? "Cache warmup finished successfully."
        : playlistChanged
          ? "Playlist synced successfully."
          : "Playlist was already up to date.",
      phaseDetail: isPrepOnly
        ? "Your browser now has warmer cache data for the next full run."
        : "You can reopen later and rely on the saved cache plus checkpoint state for a gentler rerun.",
      percent: 100,
    });
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not build the playlist.");
    renderEmptyResults({
      title: "Playlist generation failed",
      summary: "Check your Spotify app setup and try again.",
      detail: error.message || "Spotify rejected one of the requests during the run.",
    });
    addRunLogEntry(`Run failed: ${error.message || "Unknown error"}`);
    renderRunLog();
    renderRunState({
      visible: true,
      modeLabel: activeRunModeLabel,
      phaseLabel: "Run interrupted",
      tuningLabel: runTuning.label,
      progressLabel: error.message || "The run stopped before it could finish.",
      phaseDetail: "The latest checkpoint and warmed caches were kept when possible, so Resume should have a better starting point.",
      percent: 100,
      failed: true,
    });
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

async function fetchSavedLibraryArtists(accessToken, runTuning, releaseWindow) {
  setStatus("Syncing liked songs...");
  const cachedLibrary = getStoredJson(storageKeys.libraryCache, []);
  const latestCachedAddedAt = localStorage.getItem(storageKeys.libraryLatestAddedAt) ?? "";
  const libraryItems = await syncLibraryCache(cachedLibrary, latestCachedAddedAt, accessToken);
  const shouldFilterGenres = isGenreFilterEnabled();
  const activeLatestAddedAt = localStorage.getItem(storageKeys.libraryLatestAddedAt) ?? "";
  const qualifiedArtistsCache = getStoredJson(storageKeys.qualifiedArtistsCache, null);
  const qualifiedArtistsCacheKey = buildQualifiedArtistsCacheKey({
    latestAddedAt: activeLatestAddedAt,
    libraryCount: libraryItems.length,
    shouldFilterGenres,
  });

  if (
    qualifiedArtistsCache?.key === qualifiedArtistsCacheKey &&
    Array.isArray(qualifiedArtistsCache.entries)
  ) {
    setStatus("Using cached qualifying artists...");
    return qualifiedArtistsCache.entries;
  }

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
    setStoredJson(storageKeys.qualifiedArtistsCache, {
      key: qualifiedArtistsCacheKey,
      entries: [],
    });
    return [];
  }

  if (!shouldFilterGenres) {
    setStoredJson(storageKeys.qualifiedArtistsCache, {
      key: qualifiedArtistsCacheKey,
      entries: qualifyingArtists,
    });
    return qualifyingArtists;
  }

  setStatus("Hydrating artist details...");
  setBatchCheckpoint({
    phase: "artist-hydration",
    detail: `Hydrating artist details for ${qualifyingArtists.length} qualifying artists.`,
    windowKey: `${releaseWindow.start}:${releaseWindow.endExclusive}`,
    nextArtistIndex: 0,
    candidates: [],
    totalArtists: qualifyingArtists.length,
    processedArtists: 0,
  });
  const detailedArtists = await hydrateArtistDetails(
    qualifyingArtists.map((entry) => entry.artist.id),
    accessToken,
    runTuning,
    releaseWindow
  );

  const filteredArtists = qualifyingArtists
    .map((entry) => ({
      ...entry,
      artist: detailedArtists.get(entry.artist.id) || entry.artist,
    }))
    .filter((entry) => !isExcludedArtist(entry.artist));

  setStoredJson(storageKeys.qualifiedArtistsCache, {
    key: qualifiedArtistsCacheKey,
    entries: filteredArtists,
  });

  return filteredArtists;
}

async function hydrateArtistDetails(artistIds, accessToken, runTuning, releaseWindow) {
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

  for (let index = 0; index < missingArtistIds.length; index += runTuning.artistDetailsBatchSize) {
    const end = Math.min(index + runTuning.artistDetailsBatchSize, missingArtistIds.length);
    const batchIds = missingArtistIds.slice(index, index + runTuning.artistDetailsBatchSize);

    for (let batchIndex = 0; batchIndex < batchIds.length; batchIndex += 1) {
      const artistId = batchIds[batchIndex];
      setStatus(`Fetching artist details ${index + batchIndex + 1} of ${missingArtistIds.length}...`);
      const artist = await spotifyGet(`/artists/${artistId}`, accessToken);
      if (artist?.id) {
        details.set(artist.id, artist);
        cache[artist.id] = artist;
      }
    }

    setStoredJson(storageKeys.artistDetailsCache, cache);
    setBatchCheckpoint({
      phase: "artist-hydration",
      detail: `Fetched artist details for ${end} of ${missingArtistIds.length} artists.`,
      windowKey: `${releaseWindow.start}:${releaseWindow.endExclusive}`,
      nextArtistIndex: 0,
      candidates: [],
      totalArtists: missingArtistIds.length,
      processedArtists: end,
    });

    if (end < missingArtistIds.length) {
      await wait(runTuning.artistDetailsPauseMilliseconds);
    }
  }

  return details;
}

function isExcludedArtist(artist) {
  const genres = (artist?.genres ?? []).join(" ").toLowerCase();
  return excludedGenreKeywords.some((keyword) => genres.includes(keyword));
}

function isGenreFilterEnabled() {
  return (localStorage.getItem(storageKeys.genreFilterEnabled) ?? "true") !== "false";
}

function isSafeModeEnabled() {
  return (localStorage.getItem(storageKeys.safeModeEnabled) ?? "false") === "true";
}

function persistGenreFilterPreference() {
  localStorage.setItem(
    storageKeys.genreFilterEnabled,
    genreFilterEnabledInput.checked ? "true" : "false"
  );
}

function persistSafeModePreference() {
  localStorage.setItem(
    storageKeys.safeModeEnabled,
    safeModeEnabledInput.checked ? "true" : "false"
  );
}

function buildQualifiedArtistsCacheKey({ latestAddedAt, libraryCount, shouldFilterGenres }) {
  return [latestAddedAt || "none", libraryCount, shouldFilterGenres ? "filtered" : "unfiltered"].join(":");
}

function getRunTuning() {
  return isSafeModeEnabled() ? safeRunTuning : standardRunTuning;
}

async function fetchReleaseCandidates(weightedArtists, accessToken, releaseWindow, runTuning) {
  setStatus("Scanning recent releases...");
  const candidates = [];
  const releaseCache = getStoredJson(storageKeys.releaseCache, {});
  const albumTrackCache = getStoredJson(storageKeys.albumTrackCache, {});
  const shouldFilterGenres = isGenreFilterEnabled();
  const activeWindowKey = `${releaseWindow.start}:${releaseWindow.endExclusive}`;
  const shouldBypassReleaseCache = isWindowEndToday(releaseWindow);
  const cachedWindow = shouldBypassReleaseCache ? {} : releaseCache[activeWindowKey] ?? {};
  const checkpoint = getBatchCheckpoint();
  const hasMatchingCheckpoint = !shouldBypassReleaseCache && checkpoint?.windowKey === activeWindowKey;
  const restoredCandidates = hasMatchingCheckpoint ? checkpoint.candidates ?? [] : [];

  if (restoredCandidates.length) {
    candidates.push(...restoredCandidates);
  }

  for (
    let batchStart = hasMatchingCheckpoint ? checkpoint.nextArtistIndex ?? 0 : 0;
    batchStart < weightedArtists.length;
    batchStart += runTuning.releaseBatchSize
  ) {
    const batchEnd = Math.min(batchStart + runTuning.releaseBatchSize, weightedArtists.length);
    updateBatchTelemetry({
      currentBatch: Math.ceil(batchEnd / runTuning.releaseBatchSize),
      batchesCompleted: Math.ceil(batchStart / runTuning.releaseBatchSize),
      totalBatches: Math.ceil(weightedArtists.length / runTuning.releaseBatchSize),
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
      let releases;

      try {
        releases = await getArtistWindowReleases(artistId, accessToken, releaseWindow);
      } catch (error) {
        console.warn(`Skipping artist ${entry.artist.name}`, error);
        continue;
      }

      for (const album of releases) {
        let tracks;

        try {
          tracks = await getAlbumTracks(album.id, accessToken, albumTrackCache);
        } catch (error) {
          console.warn(`Skipping album ${album.name}`, error);
          continue;
        }

        let relevantTracks = selectRelevantTracks(tracks, artistId, album);

        if (shouldFilterGenres) {
          relevantTracks = await filterTracksByExcludedGenres(
            relevantTracks,
            album,
            artistId,
            accessToken,
            runTuning,
            releaseWindow
          );
        }

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

        if (album !== releases[releases.length - 1]) {
          await wait(runTuning.albumReleaseSpacingMilliseconds);
        }
      }

      cachedWindow[artistId] = artistCandidates.map((candidate) => ({
        album: candidate.album,
        track: candidate.track,
        releaseDate: candidate.releaseDate,
        isFeaturedAppearance: candidate.isFeaturedAppearance,
      }));

      if (artistIndex + 1 < batchEnd) {
        await wait(runTuning.artistReleaseSpacingMilliseconds);
      }
    }

    releaseCache[activeWindowKey] = cachedWindow;
    pruneReleaseCache(releaseCache);
    setStoredJson(storageKeys.releaseCache, releaseCache);
    setStoredJson(storageKeys.albumTrackCache, albumTrackCache);
    setBatchCheckpoint({
      windowKey: activeWindowKey,
      nextArtistIndex: batchEnd,
      candidates: candidates.map((candidate) => serializeCandidate(candidate)),
      phase: "release-scan",
      detail: `Scanned release batch ${Math.ceil(batchEnd / runTuning.releaseBatchSize)} of ${Math.ceil(
        weightedArtists.length / runTuning.releaseBatchSize
      )}.`,
      totalArtists: weightedArtists.length,
      processedArtists: batchEnd,
    });
    updateCheckpointStatus();
    updateBatchTelemetry({
      currentBatch: Math.ceil(batchEnd / runTuning.releaseBatchSize),
      batchesCompleted: Math.ceil(batchEnd / runTuning.releaseBatchSize),
      totalBatches: Math.ceil(weightedArtists.length / runTuning.releaseBatchSize),
    });

    if (batchEnd < weightedArtists.length) {
      setStatus(
        `Completed batch ${Math.ceil(batchEnd / runTuning.releaseBatchSize)} of ${Math.ceil(
          weightedArtists.length / runTuning.releaseBatchSize
        )}. Pausing before next chunk...`
      );
      await wait(runTuning.batchPauseMilliseconds);
    }
  }

  releaseCache[activeWindowKey] = cachedWindow;
  pruneReleaseCache(releaseCache);
  setStoredJson(storageKeys.releaseCache, releaseCache);
  setStoredJson(storageKeys.albumTrackCache, albumTrackCache);
  return candidates;
}

function selectRelevantTracks(tracks, artistId, album) {
  if (isAlbumLevelMatch(album, artistId)) {
    return tracks;
  }

  return tracks.filter((track) =>
    (track.artists ?? []).some((artist) => artist.id === artistId)
  );
}

function isAlbumLevelMatch(album, artistId) {
  return (album.artists ?? []).some((artist) => artist.id === artistId);
}

async function filterTracksByExcludedGenres(
  tracks,
  album,
  matchedArtistId,
  accessToken,
  runTuning,
  releaseWindow
) {
  if (!tracks.length) {
    return tracks;
  }

  const contributorArtistIds = new Set();

  for (const artist of album.artists ?? []) {
    if (artist?.id && artist.id !== matchedArtistId) {
      contributorArtistIds.add(artist.id);
    }
  }

  for (const track of tracks) {
    for (const artist of track.artists ?? []) {
      if (artist?.id && artist.id !== matchedArtistId) {
        contributorArtistIds.add(artist.id);
      }
    }
  }

  if (!contributorArtistIds.size) {
    return tracks;
  }

  const contributorDetails = await hydrateArtistDetails(
    [...contributorArtistIds],
    accessToken,
    runTuning,
    releaseWindow
  );

  return tracks.filter((track) => {
    const contributors = [...(album.artists ?? []), ...(track.artists ?? [])];

    return !contributors.some((artist) => {
      if (!artist?.id || artist.id === matchedArtistId) {
        return false;
      }

      return isExcludedArtist(contributorDetails.get(artist.id) || artist);
    });
  });
}

async function getArtistWindowReleases(artistId, accessToken, releaseWindow) {
  const releases = [];
  const seenAlbumIds = new Set();
  let offset = 0;

  while (true) {
    const page = await spotifyGet(
      `/artists/${artistId}/albums?include_groups=album,single,appears_on&limit=50&offset=${offset}`,
      accessToken
    );
    const items = page.items ?? [];

    if (!items.length) {
      break;
    }

    let sawWindowRelease = false;

    for (const album of items) {
      if (!album?.id || seenAlbumIds.has(album.id)) {
        continue;
      }

      seenAlbumIds.add(album.id);

      if (album.release_date_precision !== "day") {
        continue;
      }

      if (isWithinWindow(album.release_date, releaseWindow)) {
        sawWindowRelease = true;
        releases.push(album);
      }
    }

    if (items.length < 50) {
      break;
    }

    offset += items.length;

    // Artist release feeds are newest-first, so once a page is entirely older
    // than the active window we can stop instead of crawling the full catalog.
    if (!sawWindowRelease) {
      const lastReleaseDate = items[items.length - 1]?.release_date;
      if (lastReleaseDate && lastReleaseDate < releaseWindow.start) {
        break;
      }
    }
  }

  return releases;
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
  await spotifyPut(`/playlists/${playlistId}/items`, { uris: firstBatch }, accessToken);

  for (let index = 100; index < uris.length; index += 100) {
    const batch = uris.slice(index, index + 100);
    await spotifyPost(`/playlists/${playlistId}/items`, { uris: batch }, accessToken);
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
      `/playlists/${playlistId}/items?fields=items(item(uri)),next,total&limit=100&offset=${offset}`,
      accessToken
    );
    const items = page.items ?? [];
    uris.push(...items.map((item) => item.item?.uri).filter(Boolean));

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
  renderTrackList(tracks, { showScore: true });
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

  setupToggleButton.classList.add("hidden");
  setSetupCollapsed(false);
  applySetupCardState();
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
  renderRunState({ visible: false });
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
    storageKeys.qualifiedArtistsCache,
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

function ensureCurrentStorageVersion() {
  const storedVersion = localStorage.getItem(storageKeys.appStorageVersion);
  if (storedVersion === appStorageVersion) {
    return;
  }

  clearLegacyAppState();
  localStorage.setItem(storageKeys.appStorageVersion, appStorageVersion);
}

function clearLegacyAppState() {
  for (const key of [
    storageKeys.accessToken,
    storageKeys.refreshToken,
    storageKeys.expiresAt,
    storageKeys.codeVerifier,
    storageKeys.genreFilterEnabled,
    storageKeys.setupCollapsed,
    storageKeys.playlistId,
    storageKeys.libraryCache,
    storageKeys.libraryLatestAddedAt,
    storageKeys.libraryLastFullScanAt,
    storageKeys.qualifiedArtistsCache,
    storageKeys.artistDetailsCache,
    storageKeys.releaseCache,
    storageKeys.albumTrackCache,
    storageKeys.lastRunSummary,
    storageKeys.batchCheckpoint,
    storageKeys.rateTelemetry,
    storageKeys.runLog,
  ]) {
    localStorage.removeItem(key);
  }
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
  let hasRefreshedToken = false;

  while (attempt < maxSpotifyRetries) {
    let response;

    await waitForSpotifyRequestSlot();
    response = await fetchWithNetworkRetries(
      `https://api.spotify.com/v1${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${activeToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      },
      "Spotify API request"
    );

    if (response.status === 204) {
      return null;
    }

    if (response.status === 401 && !hasRefreshedToken) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        activeToken = refreshedToken;
        hasRefreshedToken = true;
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

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(getSpotifyErrorMessage(data, `Spotify API request failed (${response.status}).`));
    }

    return data;
  }

  throw new Error("Spotify API kept rate limiting requests. Please try again shortly.");
}

async function fetchWithNetworkRetries(url, init, label = "Spotify request") {
  let lastError = null;

  for (let attempt = 0; attempt < maxNetworkRetries; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;

      if (attempt + 1 >= maxNetworkRetries) {
        break;
      }

      addRunLogEntry(`${label} hit a network issue. Retrying shortly...`);
      renderRunLog();
      await wait(networkRetryDelayMilliseconds * (attempt + 1));
    }
  }

  throw new Error(
    `${label} kept failing at the network layer. Check your connection and try again.`
  );
}

async function waitForSpotifyRequestSlot() {
  const now = Date.now();
  const waitMilliseconds = Math.max(0, nextSpotifyRequestAt - now);
  nextSpotifyRequestAt =
    Math.max(nextSpotifyRequestAt, now) + currentSpotifyRequestSpacingMilliseconds;

  if (waitMilliseconds > 0) {
    await wait(waitMilliseconds);
  }
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

  checkpointStatus.textContent = `Checkpoint saved: ${describeCheckpointPhase(checkpoint)}.`;
  if (!isRunInProgress) {
    resumeButton.disabled = false;
  }
}

function updateRateTelemetry() {
  const telemetry = getStoredJson(storageKeys.rateTelemetry, {});
  telemetryLast429.textContent = telemetry.last429At
    ? `Last rate limit at ${formatDateTime(telemetry.last429At)} on ${telemetry.lastPath ?? "Spotify request"}.`
    : "No 429s recorded.";
  telemetryRetryDelay.textContent = telemetry.retryDelaySeconds
    ? `Current retry delay: ${telemetry.retryDelaySeconds}s`
    : "No retry delay active.";
  telemetryBatch.textContent = telemetry.totalBatches
    ? `Current release batch ${telemetry.currentBatch ?? 0} of ${telemetry.totalBatches}; completed ${telemetry.batchesCompleted ?? 0}.`
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

function resetSpotifyRequestThrottle(runTuning = getRunTuning()) {
  currentRunTuning = runTuning;
  nextSpotifyRequestAt = 0;
  currentSpotifyRequestSpacingMilliseconds = runTuning.requestSpacingMilliseconds;
}

function recordRateLimitEvent(retryDelaySeconds, path) {
  const telemetry = getStoredJson(storageKeys.rateTelemetry, {});
  telemetry.last429At = new Date().toISOString();
  telemetry.retryDelaySeconds = retryDelaySeconds;
  telemetry.lastPath = path;
  setStoredJson(storageKeys.rateTelemetry, telemetry);
  currentSpotifyRequestSpacingMilliseconds = Math.max(
    currentSpotifyRequestSpacingMilliseconds,
    currentRunTuning.requestSpacingOn429Milliseconds
  );
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

function getRunModeLabel({ mode = "build", startFresh = false, requireCheckpoint = false } = {}) {
  if (mode === "prep") {
    return "Cache warmup";
  }

  if (requireCheckpoint) {
    return "Resume checkpoint";
  }

  if (startFresh) {
    return "Fresh rebuild";
  }

  return "Full build";
}

function describeCheckpointPhase(checkpoint) {
  if (!checkpoint?.phase) {
    return `release scan for ${checkpoint?.windowKey ?? "this window"} at artist ${checkpoint?.nextArtistIndex ?? 0}`;
  }

  if (checkpoint.phase === "library-sync") {
    return "library sync";
  }

  if (checkpoint.phase === "artist-hydration") {
    return checkpoint.totalArtists
      ? `artist hydration (${checkpoint.processedArtists ?? 0}/${checkpoint.totalArtists})`
      : "artist hydration";
  }

  if (checkpoint.phase === "release-scan") {
    return checkpoint.totalArtists
      ? `release scan (${checkpoint.processedArtists ?? checkpoint.nextArtistIndex ?? 0}/${checkpoint.totalArtists})`
      : `release scan at artist ${checkpoint.nextArtistIndex ?? 0}`;
  }

  if (checkpoint.phase === "playlist-sync") {
    return "playlist sync";
  }

  return checkpoint.phase;
}

function renderRunState({
  visible,
  modeLabel = "Full build",
  phaseLabel = "Phase 1 of 4",
  tuningLabel = "Standard pacing",
  progressLabel = "Waiting to start.",
  phaseDetail = "The app will keep saving progress as it moves through each phase.",
  percent = 0,
  failed = false,
} = {}) {
  runStatePanel.classList.toggle("hidden", !visible);
  if (!visible) {
    runStatePanel.classList.remove("is-failed");
    runProgressFill.style.width = "0%";
    return;
  }

  runStatePanel.classList.toggle("is-failed", failed);
  runPhaseLabel.textContent = phaseLabel;
  runTuningLabel.textContent = tuningLabel;
  runModeLabel.textContent = modeLabel;
  runProgressLabel.textContent = progressLabel;
  runPhaseDetail.textContent = phaseDetail;
  runProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function renderResultsPlaceholder(message) {
  resultsList.innerHTML = `
    <li class="result-item result-item-empty">
      <div class="result-copy">
        <strong>Run in progress</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    </li>
  `;
}

function renderEmptyResults({ title, summary, detail }) {
  resultsCard.classList.remove("hidden");
  resultsTitle.textContent = title;
  resultsSummary.textContent = summary;
  resultsList.innerHTML = `
    <li class="result-item result-item-empty">
      <div class="result-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    </li>
  `;
}

function renderTrackList(tracks, { showScore = true } = {}) {
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
            ${showScore ? `<span class="meta-pill">Score ${entry.score}</span>` : ""}
          </div>
        </li>
      `
    )
    .join("");
}

function updateSettingsSummary({
  runModeLabel: activeRunModeLabel = "Full build",
  releaseWindow = getActiveFridayWindow(),
  runTuning = getRunTuning(),
} = {}) {
  settingsStrip.classList.remove("hidden");
  settingsMode.textContent = `Mode: ${activeRunModeLabel}`;
  settingsPlaylist.textContent = `Playlist: ${playlistNameInput.value.trim() || "Release Radar"}`;
  settingsFilter.textContent = `Genre filter: ${isGenreFilterEnabled() ? "On" : "Off"}`;
  settingsSafeMode.textContent = `Safe mode: ${isSafeModeEnabled() ? "On" : "Off"} (${runTuning.label})`;
  settingsWindowPill.textContent = `Window: ${formatWindowDate(releaseWindow.start)} to ${formatWindowDate(
    getInclusiveWindowEnd(releaseWindow)
  )}`;
}

function updateLastPlaylistLink() {
  const summary = getStoredJson(storageKeys.lastRunSummary, null);
  if (!summary?.playlistId) {
    lastPlaylistLink.classList.add("hidden");
    lastPlaylistLink.removeAttribute("href");
    return;
  }

  lastPlaylistLink.href = `https://open.spotify.com/playlist/${summary.playlistId}`;
  lastPlaylistLink.classList.remove("hidden");
}

function isSetupCollapsed() {
  return localStorage.getItem(storageKeys.setupCollapsed) === "true";
}

function setSetupCollapsed(collapsed) {
  localStorage.setItem(storageKeys.setupCollapsed, collapsed ? "true" : "false");
}

function applySetupCardState() {
  const collapsed = isSetupCollapsed() && !setupToggleButton.classList.contains("hidden");
  setupCard.classList.toggle("is-collapsed", collapsed);
  setupCardBody.classList.toggle("hidden", collapsed);
  setupToggleButton.textContent = collapsed ? "Expand" : "Collapse";
}

function toggleSetupCard() {
  setSetupCollapsed(!isSetupCollapsed());
  applySetupCardState();
}

function getActiveFridayWindow() {
  const now = new Date();
  const friday = new Date(now);
  const day = friday.getDay();
  const daysUntilFriday = (5 - day + 7) % 7;

  friday.setHours(1, 0, 0, 0);
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

function isWindowEndToday(releaseWindow) {
  return toDateString(new Date()) === getInclusiveWindowEnd(releaseWindow);
}

async function safeParseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function getSpotifyErrorMessage(data, fallback) {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  return (
    data?.error?.message ||
    data?.error_description ||
    (typeof data?.error === "string" ? data.error : null) ||
    fallback
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
