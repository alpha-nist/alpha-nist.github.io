const video = document.querySelector("#assembly-video");
const chapters = [...document.querySelectorAll("#demo .chapter")];
const chapterStatus = document.querySelector("#demo .chapter-status");
const films = [...document.querySelectorAll("video:not(#strategy-detail)")];

for (const player of films) {
  player.addEventListener("play", () => {
    for (const other of films) if (other !== player) other.pause();
  });
}

for (const section of document.querySelectorAll("#demo, #starting-states")) {
  const player = section.querySelector("video");
  const play = section.querySelector(".film-play");
  if (!player || !play) continue;
  player.controls = false;
  play.hidden = false;
  const startFilm = () => {
    player.controls = true;
    play.hidden = true;
    player.focus({ preventScroll: true });
    player.play().catch(() => { if (player.paused) play.hidden = false; });
  };
  play.addEventListener("click", startFilm);
  player.addEventListener("play", () => { play.hidden = true; });
  player.addEventListener("error", () => { player.controls = true; play.hidden = true; });
}

if (video && chapters.length) {
  const updateChapter = () => {
    let activeIndex = 0;
    chapters.forEach((chapter, index) => {
      if (video.currentTime >= Number(chapter.dataset.start)) activeIndex = index;
    });
    chapters.forEach((chapter, index) => {
      chapter.setAttribute("aria-pressed", String(index === activeIndex));
    });
  };

  const enableChapters = () => {
    chapters.forEach((chapter) => { chapter.disabled = false; });
  };

  chapters.forEach((chapter) => {
    chapter.addEventListener("click", () => {
      video.currentTime = Number(chapter.dataset.start);
      updateChapter();
      chapterStatus.textContent = `Selected ${chapter.querySelector(".chapter-name").textContent}. Press play in the video to watch.`;
      if (!video.paused) chapterStatus.textContent = `Playing ${chapter.querySelector(".chapter-name").textContent}.`;
    });
  });

  video.addEventListener("loadedmetadata", enableChapters);
  video.addEventListener("timeupdate", updateChapter);
  video.addEventListener("seeked", updateChapter);
  if (video.readyState >= 1) enableChapters();
}

const gallery = document.querySelector(".behavior-gallery");
if (gallery) {
  const track = gallery.querySelector(".behavior-track");
  const slides = [...track.querySelectorAll(".behavior-slide")];
  const navigation = gallery.querySelector(".behavior-navigation");
  const controls = gallery.querySelector(".behavior-controls");
  const previous = controls.querySelector(".behavior-prev");
  const next = controls.querySelector(".behavior-next");
  const status = controls.querySelector(".behavior-status");
  let activeIndex = 0, scrollFrame;

  const update = (index) => {
    activeIndex = index;
    [...navigation.children].forEach((button, candidate) => button.setAttribute("aria-pressed", String(candidate === index)));
    previous.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    const position = `${index + 1} / ${slides.length}`;
    if (status.textContent !== position) status.textContent = position;
  };
  const goTo = (index) => {
    index = Math.max(0, Math.min(slides.length - 1, index));
    track.scrollTo({ left: slides[index].offsetLeft - slides[0].offsetLeft, behavior: "instant" });
    update(index);
  };
  slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter";
    button.textContent = slide.dataset.label;
    button.setAttribute("aria-controls", slide.id);
    button.addEventListener("click", () => goTo(index));
    navigation.append(button);
  });
  previous.addEventListener("click", () => goTo(activeIndex - 1));
  next.addEventListener("click", () => goTo(activeIndex + 1));
  track.addEventListener("keydown", event => {
    if (event.target !== track) return;
    const targets = { ArrowLeft: activeIndex - 1, ArrowRight: activeIndex + 1, Home: 0, End: slides.length - 1 };
    if (!(event.key in targets)) return;
    event.preventDefault();
    goTo(targets[event.key]);
  });
  track.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined;
      const distances = slides.map(slide => Math.abs(slide.offsetLeft - slides[0].offsetLeft - track.scrollLeft));
      update(distances.indexOf(Math.min(...distances)));
    });
  }, { passive: true });
  new ResizeObserver(() => goTo(activeIndex)).observe(track);
  navigation.hidden = false;
  controls.hidden = false;
  update(0);
}

const strategies = document.querySelector("#strategies");
if (strategies) {
  const player = strategies.querySelector("video");
  const play = strategies.querySelector(".film-play");
  const moments = strategies.querySelector(".strategy-moments");
  const labels = moments.querySelector(".moment-groups");
  const status = strategies.querySelector(".strategy-status");
  const closeup = strategies.querySelector(".closeup-toggle");
  const detail = strategies.querySelector("#strategy-detail");
  const frame = strategies.querySelector("#strategy-player");
  const fullscreen = strategies.querySelector(".strategy-fullscreen");
  let pendingSeek, loading = false, playRequest = 0;
  let detailStarted = false, detailFailed = false, detailReady = true, detailPlayPending = false;
  let exactDetailSeek = false, lastDetailSeek = -Infinity;
  player.controls = false;
  play.hidden = false;
  closeup.hidden = false;

  const updateDetailVisibility = () => {
    detail.hidden = closeup.getAttribute("aria-checked") !== "true" || detailFailed || !detailReady;
  };
  closeup.addEventListener("click", () => {
    closeup.setAttribute("aria-checked", String(closeup.getAttribute("aria-checked") !== "true"));
    updateDetailVisibility();
  });
  updateDetailVisibility();

  const failDetail = () => {
    detailFailed = true;
    closeup.disabled = true;
    closeup.setAttribute("aria-checked", "false");
    updateDetailVisibility();
    status.textContent = "The close-up is unavailable. The fixed view can still be played.";
  };
  const syncDetail = (force = false) => {
    exactDetailSeek ||= force;
    if (detailFailed || player.readyState < 1) return;
    if (!detailStarted) {
      detailStarted = true;
      detailReady = false;
      updateDetailVisibility();
      detail.preload = "auto";
      detail.load();
      return;
    }
    if (detail.readyState < 1) return;
    if (detail.playbackRate !== player.playbackRate) detail.playbackRate = player.playbackRate;
    const masterStable = !player.seeking && (player.paused || player.readyState >= 3);
    if (player.paused || player.ended || !masterStable) {
      if (!detail.paused) detail.pause();
    } else if (detail.paused && !detailPlayPending) {
      detailPlayPending = true;
      detail.play().catch(error => {
        if (error.name !== "AbortError") failDetail();
      }).finally(() => { detailPlayPending = false; });
    }
    const offset = Math.abs(detail.currentTime - player.currentTime);
    if (offset <= .001) exactDetailSeek = false;
    if (!detail.seeking && (exactDetailSeek || (masterStable && offset > .06 && performance.now() - lastDetailSeek > 500))) {
      detail.currentTime = Math.min(player.currentTime, detail.duration);
      exactDetailSeek = false;
      lastDetailSeek = performance.now();
    }
    detailReady = masterStable && detail.readyState >= (player.paused ? 2 : 3) && !detail.seeking && offset <= .06;
    updateDetailVisibility();
  };
  for (const event of ["loadedmetadata", "play", "playing", "canplay", "waiting", "stalled", "ratechange", "timeupdate", "ended"]) {
    player.addEventListener(event, () => syncDetail());
  }
  for (const event of ["pause", "seeked"]) player.addEventListener(event, () => syncDetail(true));
  player.addEventListener("seeking", () => {
    detailReady = false;
    updateDetailVisibility();
    syncDetail(true);
  });
  for (const event of ["loadedmetadata", "loadeddata", "canplay", "seeked", "timeupdate"]) {
    detail.addEventListener(event, () => syncDetail());
  }
  detail.addEventListener("waiting", () => {
    detailReady = false;
    updateDetailVisibility();
  });
  detail.addEventListener("error", failDetail);
  if (player.requestVideoFrameCallback) {
    const followFrame = () => {
      syncDetail();
      player.requestVideoFrameCallback(followFrame);
    };
    player.requestVideoFrameCallback(followFrame);
  }

  if (frame.requestFullscreen && document.fullscreenEnabled) {
    fullscreen.hidden = false;
    player.controlsList?.add("nofullscreen");
    fullscreen.addEventListener("click", () => {
      const request = document.fullscreenElement === frame ? document.exitFullscreen() : frame.requestFullscreen();
      request.catch(() => { status.textContent = "Fullscreen is unavailable in this browser."; });
    });
    document.addEventListener("fullscreenchange", () => {
      const label = document.fullscreenElement === frame ? "Exit fullscreen" : "Enter fullscreen";
      fullscreen.setAttribute("aria-label", label);
      fullscreen.title = label;
    });
  }

  const startPlayback = () => {
    const request = ++playRequest;
    player.play().catch(() => {
      if (request !== playRequest || !player.paused) return;
      play.hidden = false;
      status.textContent = "Press Play in the video controls to continue.";
    });
  };
  const restoreSeek = () => {
    if (!pendingSeek || player.readyState < 1) return;
    const restore = pendingSeek;
    pendingSeek = undefined;
    player.currentTime = Math.min(restore.time, player.duration);
    player.playbackRate = restore.rate;
    if (restore.playing) startPlayback();
  };
  const seek = (time) => {
    pendingSeek = { time, rate: pendingSeek?.rate ?? player.playbackRate, playing: pendingSeek?.playing ?? !player.paused };
    player.controls = true;
    play.hidden = true;
    status.textContent = "";
    if (player.readyState >= 1) restoreSeek();
    else if (!loading) {
      loading = true;
      player.preload = "auto";
      player.defaultPlaybackRate = pendingSeek.rate;
      player.load();
    }
  };
  play.addEventListener("click", () => {
    player.controls = true;
    play.hidden = true;
    if (pendingSeek) pendingSeek.playing = true;
    startPlayback();
  });
  player.addEventListener("loadedmetadata", () => { loading = false; restoreSeek(); });
  player.addEventListener("ratechange", () => { if (pendingSeek) pendingSeek.rate = player.playbackRate; });
  player.addEventListener("play", () => {
    play.hidden = true;
    status.textContent = "";
  });
  for (const other of films) {
    if (other !== player) other.addEventListener("play", () => {
      playRequest++;
      if (pendingSeek) pendingSeek.playing = false;
    });
  }
  player.addEventListener("error", () => {
    loading = false;
    pendingSeek = undefined;
    playRequest++;
    player.controls = true;
    play.hidden = true;
    status.textContent = "The film could not load. Try reloading the page.";
  });
  fetch("assets/k10-strategies/timeline.json?v=detail-1").then(response => {
    if (!response.ok) throw new Error("Timeline unavailable.");
    return response.json();
  }).then(timeline => {
    if (!Number.isFinite(timeline.duration_s) || !Array.isArray(timeline.episodes) || !timeline.episodes.length) throw new Error("Invalid timeline.");
    let end = 0;
    for (const episode of timeline.episodes) {
      if (!Number.isFinite(episode.start_s) || episode.start_s < end - 0.001 || !Number.isFinite(episode.duration_s) || episode.duration_s <= 0 || !Array.isArray(episode.keyframes)) throw new Error("Invalid episode.");
      end = episode.start_s + episode.duration_s;
      if (end > timeline.duration_s + 0.001 || episode.keyframes.some(marker => !Number.isFinite(marker.time_s) || marker.time_s < episode.start_s || marker.time_s >= end || typeof marker.label !== "string" || !marker.label.trim())) throw new Error("Invalid labeled moment.");
    }
    const groupNames = {
      "Move / toss object away": "Moving objects aside",
      "Throw / toss object away": "Moving objects aside",
      "Toss object away": "Moving objects aside",
      "Separate closely spaced objects": "Object separation",
      "Long-range threading": "Long-range manipulation",
      "Long-range insertion": "Long-range manipulation",
      "Check assembly completion (patrolling)": "Revisiting assembled parts",
    };
    const groups = new Map();
    for (const marker of timeline.episodes.flatMap(episode => episode.keyframes)) {
      const name = groupNames[marker.label] ?? marker.label;
      if (!groups.has(name)) {
        const group = document.createElement("div");
        group.className = "moment-group";
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", name);
        const label = document.createElement("p");
        label.className = "moment-label";
        label.textContent = name;
        const times = document.createElement("div");
        times.className = "moment-times";
        group.append(label, times);
        labels.append(group);
        groups.set(name, times);
      }
      const times = groups.get(name);
      const button = document.createElement("button");
      button.className = "moment-time";
      button.type = "button";
      button.setAttribute("aria-controls", player.id);
      const time = document.createElement("time");
      time.textContent = `${Math.floor(marker.time_s / 60)}:${String(Math.floor(marker.time_s % 60)).padStart(2, "0")}`;
      time.dateTime = `PT${marker.time_s}S`;
      button.setAttribute("aria-label", `${name} at ${time.textContent}`);
      button.append(time);
      button.addEventListener("click", () => seek(marker.time_s));
      times.append(button);
    }
    moments.hidden = labels.children.length === 0;
  }).catch(() => { status.textContent = "Moment labels are unavailable. You can still watch the film using the video controls."; });
}
