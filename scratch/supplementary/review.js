"use strict";

const player = document.getElementById("film-player");
const currentTime = document.getElementById("current-time");
const currentTitle = document.getElementById("current-title");
const chapterContainer = document.getElementById("chapters");
const behaviorContainer = document.getElementById("behaviors");
const scriptContainer = document.getElementById("script-sections");
let chapters = [];
let sections = [];
let activeSection = -1;
let activeChapter = -1;
let requestedTime = null;
let filmDuration = Number(player.dataset.duration);

function timestamp(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function updateDuration(seconds) {
  const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : Number(seconds);
  if (!Number.isFinite(duration) || duration <= 0) return;
  filmDuration = duration;
  for (const label of document.querySelectorAll("[data-film-duration]")) label.textContent = timestamp(duration);
  for (const input of document.querySelectorAll("#cue-start, #cue-end")) input.max = String(duration);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function seek(time) {
  const target = Math.max(0, Number(time) || 0);
  requestedTime = target;
  if (player.readyState > 0) applyRequestedTime();
  else player.load();
  updatePosition(target);
}

function applyRequestedTime() {
  if (requestedTime === null) return;
  const end = Math.max(0, filmDuration - 0.01);
  player.currentTime = Math.min(requestedTime, end);
  requestedTime = null;
}

function updatePosition(time = player.currentTime) {
  currentTime.textContent = timestamp(time);
  const sectionIndex = sections.findIndex(section => time >= section.start && time < section.end);
  const nextSection = sectionIndex >= 0 ? sectionIndex : time >= filmDuration ? sections.length - 1 : -1;
  if (nextSection !== activeSection) {
    if (activeSection >= 0) sections[activeSection].element.classList.remove("is-current");
    activeSection = nextSection;
    if (activeSection >= 0) {
      sections[activeSection].element.classList.add("is-current");
      currentTitle.textContent = sections[activeSection].title;
    }
  }
  let nextChapter = -1;
  chapters.forEach((chapter, index) => { if (time >= chapter.start) nextChapter = index; });
  if (nextChapter !== activeChapter) {
    if (activeChapter >= 0) chapters[activeChapter].element.removeAttribute("aria-current");
    activeChapter = nextChapter;
    if (activeChapter >= 0) chapters[activeChapter].element.setAttribute("aria-current", "true");
  }
}

function renderStory(story) {
  if (!Array.isArray(story.chapters) || !Array.isArray(story.sections)) throw new Error("Invalid story data");
  updateDuration(story.duration_s);
  chapters = story.chapters.map(chapter => {
    const button = makeElement("button", "chapter");
    button.type = "button";
    button.setAttribute("aria-controls", "film-player");
    button.append(makeElement("span", "chapter-time", timestamp(chapter.start)));
    button.append(makeElement("span", "chapter-title", chapter.title));
    button.addEventListener("click", () => seek(chapter.start));
    chapterContainer.append(button);
    return { ...chapter, element: button };
  });
  for (const [horizon, title] of [["short", "Short-horizon dexterity"], ["long", "Long-horizon coordination"]]) {
    const behaviors = (story.behavior_names || []).filter(behavior => behavior.horizon === horizon);
    if (!behaviors.length) continue;
    const group = makeElement("section", "behavior-horizon");
    const heading = makeElement("h3", "behavior-heading", title);
    heading.id = `behaviors-${horizon}`;
    group.setAttribute("aria-labelledby", heading.id);
    group.append(heading);
    for (const category of new Set(behaviors.map(behavior => behavior.category))) {
      const label = makeElement("h4", "behavior-category", category);
      const row = makeElement("div", "behavior-list");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", category);
      for (const behavior of behaviors.filter(behavior => behavior.category === category)) {
        const button = makeElement("button", "behavior");
        button.type = "button";
        button.title = behavior.description || "";
        button.setAttribute("aria-controls", "film-player");
        button.append(makeElement("time", "", timestamp(behavior.time)), makeElement("span", "", behavior.name));
        button.addEventListener("click", () => seek(behavior.time));
        row.append(button);
      }
      group.append(label, row);
    }
    behaviorContainer.append(group);
  }
  sections = story.sections.map((section, index) => {
    const article = makeElement("article", "script-section");
    const heading = makeElement("h3", "script-heading");
    heading.id = `script-heading-${index}`;
    article.setAttribute("aria-labelledby", heading.id);
    const button = makeElement("button", "section-jump");
    button.type = "button";
    button.setAttribute("aria-controls", "film-player");
    button.append(makeElement("time", "", `${timestamp(section.start)}–${timestamp(section.end)}`));
    button.append(makeElement("span", "", section.title));
    button.addEventListener("click", () => seek(section.start));
    heading.append(button);
    article.append(heading, makeElement("p", "narration", section.narration));
    if (section.visual) {
      const visual = makeElement("p", "visual-direction");
      visual.append(makeElement("span", "visual-label", "On screen"), document.createTextNode(section.visual));
      article.append(visual);
    }
    scriptContainer.append(article);
    return { ...section, element: article };
  });
  chapterContainer.setAttribute("aria-busy", "false");
  document.getElementById("script-review").hidden = false;
  updatePosition(requestedTime ?? player.currentTime);
}

player.addEventListener("loadedmetadata", () => { updateDuration(player.duration); applyRequestedTime(); });
player.addEventListener("durationchange", () => updateDuration(player.duration));
player.addEventListener("timeupdate", () => updatePosition(requestedTime ?? player.currentTime));
player.addEventListener("seeked", () => updatePosition());
player.addEventListener("ended", () => updatePosition());

fetch("story.json?v=3", { cache: "no-cache" })
  .then(response => {
    if (!response.ok) throw new Error("Story unavailable");
    return response.json();
  })
  .then(renderStory)
  .catch(() => {
    chapterContainer.setAttribute("aria-busy", "false");
    document.getElementById("data-error").hidden = false;
  });

fetch("captions.srt?v=3", { method: "HEAD", cache: "no-cache" })
  .then(response => { document.getElementById("srt-download").hidden = !response.ok; })
  .catch(() => {});

// The editable captions are local to this browser; the film and narration never change.
const frame = document.getElementById("player-frame");
const overlay = document.getElementById("caption-overlay");
const display = document.getElementById("caption-display");
const editor = document.getElementById("caption-editor");
const textField = document.getElementById("cue-text");
const startField = document.getElementById("cue-start");
const endField = document.getElementById("cue-end");
const captionStatus = document.getElementById("caption-status");
const saveStatus = document.getElementById("caption-save");
const cueError = document.getElementById("cue-error");
const sizeField = document.getElementById("caption-size");
const placementField = document.getElementById("caption-placement");
const captionToggle = document.getElementById("captions-toggle");
const followButton = document.getElementById("cue-follow");
const fullButton = document.getElementById("fullscreen-toggle");
let cues = [], originals = [], selectedCue = -1, following = true, captionsEnabled = true;
let storageKey = "", fingerprint = "", animation = 0, saveTimer = 0;

function subtitleTime(value) {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isFinite(part))) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseCaptions(source) {
  return source.replace(/^\uFEFF/, "").replace(/\r/g, "").trim().split(/\n\s*\n/).flatMap(block => {
    const lines = block.split("\n");
    const index = lines.findIndex(line => line.includes(" --> "));
    if (index < 0) return [];
    const [start, end] = lines[index].split(" --> ");
    const text = lines.slice(index + 1).join("\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return [{ start: subtitleTime(start), end: subtitleTime(end.split(/\s/)[0]), text }];
  });
}

function validCues(items) {
  return Array.isArray(items) && items.length > 0 && items.every((cue, index) =>
    cue && typeof cue.text === "string" && cue.text.length <= 3000 && Number.isFinite(cue.start) &&
    Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && cue.end <= filmDuration &&
    (!index || cue.start >= items[index - 1].end));
}

function disableNativeCaptions() {
  for (const track of player.textTracks) {
    if (["captions", "subtitles"].includes(track.kind) && track.mode !== "disabled") track.mode = "disabled";
  }
}
player.textTracks.addEventListener("addtrack", disableNativeCaptions);
player.textTracks.addEventListener("change", disableNativeCaptions);
disableNativeCaptions();

function saveCaptions() {
  if (!storageKey || !cues.length) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ schema_version: 1, fingerprint, cues, enabled: captionsEnabled, size: Number(sizeField.value), placement: placementField.value }));
    saveStatus.textContent = "Saved on this device";
  } catch {
    saveStatus.textContent = "Autosave unavailable — export edits";
  }
}

function scheduleSave() {
  saveStatus.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCaptions, 180);
}
window.addEventListener("pagehide", saveCaptions);

function sizeCaptions() {
  const below = placementField.value === "below";
  const width = below ? frame.clientWidth : Math.min(frame.clientWidth, frame.clientHeight * 16 / 9);
  const height = width * 9 / 16;
  const fontSize = Math.max(16, Math.min(70, width * Number(sizeField.value) / 1000));
  overlay.style.fontSize = `${fontSize}px`;
  frame.style.setProperty("--caption-band-height", `${fontSize * 3.9 + 20}px`);
  if (below) {
    overlay.style.removeProperty("max-width");
    overlay.style.removeProperty("bottom");
  } else {
    overlay.style.maxWidth = `${width * .94}px`;
    overlay.style.bottom = `${(frame.clientHeight - height) / 2 + Math.max(46, height * .11)}px`;
  }
  document.getElementById("caption-size-value").textContent = sizeField.value;
}
new ResizeObserver(sizeCaptions).observe(frame);

function setTimingError(message) {
  cueError.textContent = message;
  cueError.hidden = !message;
  startField.setAttribute("aria-invalid", String(Boolean(message)));
  endField.setAttribute("aria-invalid", String(Boolean(message)));
}

function updateEditorStatus() {
  captionStatus.textContent = following ? "Following playback · type to hold this subtitle" : `Editing subtitle ${selectedCue + 1} · playback can continue`;
  followButton.disabled = following;
  document.getElementById("cue-number").textContent = `${selectedCue + 1} / ${cues.length}`;
  document.getElementById("cue-previous").disabled = selectedCue <= 0;
  document.getElementById("cue-next").disabled = selectedCue >= cues.length - 1;
}

function selectCue(index) {
  if (index < 0 || index >= cues.length) return;
  selectedCue = index;
  textField.value = cues[index].text;
  startField.value = cues[index].start.toFixed(3);
  endField.value = cues[index].end.toFixed(3);
  setTimingError("");
  updateEditorStatus();
}

function activeCue(time = player.currentTime) {
  return cues.findIndex(cue => time >= cue.start && time < cue.end);
}

function paintCaptions() {
  const index = activeCue();
  const text = index >= 0 ? cues[index].text : "";
  const visibleText = captionsEnabled ? text : "";
  if (display.textContent !== visibleText) display.textContent = visibleText;
  overlay.hidden = placementField.value === "over" && !visibleText.trim();
  if (following && index >= 0 && index !== selectedCue) selectCue(index);
}

function animateCaptions() {
  cancelAnimationFrame(animation);
  paintCaptions();
  if (!player.paused && !player.ended) animation = requestAnimationFrame(animateCaptions);
}
for (const event of ["timeupdate", "seeked", "loadedmetadata", "pause", "ended"]) player.addEventListener(event, paintCaptions);
player.addEventListener("play", animateCaptions);

function lockCue() {
  if (selectedCue < 0) return;
  following = false;
  updateEditorStatus();
}
for (const field of [textField, startField, endField]) field.addEventListener("focus", lockCue);
textField.addEventListener("input", () => {
  if (selectedCue < 0) return;
  lockCue();
  cues[selectedCue].text = textField.value;
  paintCaptions();
  scheduleSave();
});

function changeTiming() {
  if (selectedCue < 0) return;
  lockCue();
  const start = startField.valueAsNumber, end = endField.valueAsNumber;
  const previousEnd = selectedCue ? cues[selectedCue - 1].end : 0;
  const nextStart = selectedCue < cues.length - 1 ? cues[selectedCue + 1].start : filmDuration;
  let error = "";
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > filmDuration || end <= start) error = `Use a start before the end, between 0 and ${filmDuration} seconds.`;
  else if (start < previousEnd || end > nextStart) error = `Keep this subtitle between ${previousEnd.toFixed(3)} and ${nextStart.toFixed(3)} s so it does not overlap its neighbors.`;
  setTimingError(error);
  if (error) return;
  cues[selectedCue].start = start;
  cues[selectedCue].end = end;
  paintCaptions();
  scheduleSave();
}
startField.addEventListener("input", changeTiming);
endField.addEventListener("input", changeTiming);

function mayLeaveCue() {
  return cueError.hidden || window.confirm("These times are invalid and have not been saved. Discard the invalid times?");
}
document.getElementById("cue-previous").addEventListener("click", () => {
  if (mayLeaveCue()) { following = false; selectCue(selectedCue - 1); }
});
document.getElementById("cue-next").addEventListener("click", () => {
  if (mayLeaveCue()) { following = false; selectCue(selectedCue + 1); }
});
followButton.addEventListener("click", () => {
  if (!mayLeaveCue()) return;
  following = true;
  const index = activeCue();
  selectCue(index >= 0 ? index : Math.max(0, selectedCue));
});
document.getElementById("cue-jump").addEventListener("click", () => { if (selectedCue >= 0) seek(cues[selectedCue].start); });

captionToggle.addEventListener("click", () => {
  captionsEnabled = !captionsEnabled;
  captionToggle.setAttribute("aria-pressed", String(captionsEnabled));
  captionToggle.textContent = captionsEnabled ? "Subtitles on" : "Subtitles off";
  paintCaptions();
  scheduleSave();
});
sizeField.addEventListener("input", () => { sizeCaptions(); scheduleSave(); });
placementField.addEventListener("change", () => {
  frame.classList.toggle("caption-below", placementField.value === "below");
  sizeCaptions();
  paintCaptions();
  scheduleSave();
});
document.getElementById("editor-toggle").addEventListener("click", event => {
  editor.hidden = !editor.hidden;
  document.getElementById("review-layout").classList.toggle("editor-hidden", editor.hidden);
  event.currentTarget.setAttribute("aria-expanded", String(!editor.hidden));
  event.currentTarget.textContent = editor.hidden ? "Show editor" : "Hide editor";
});

function exportTimestamp(seconds, separator) {
  const total = Math.round(seconds * 1000);
  return `${String(Math.floor(total / 3600000)).padStart(2, "0")}:${String(Math.floor(total / 60000) % 60).padStart(2, "0")}:${String(Math.floor(total / 1000) % 60).padStart(2, "0")}${separator}${String(total % 1000).padStart(3, "0")}`;
}
for (const button of document.querySelectorAll("[data-caption-export]")) button.addEventListener("click", () => {
  if (!cueError.hidden && !window.confirm("Invalid draft times are not included. Export the saved, valid subtitle times?")) return;
  const format = button.dataset.captionExport;
  let content;
  if (format === "json") content = JSON.stringify({ schema_version: 1, source_fingerprint: fingerprint, duration_s: filmDuration, cues }, null, 2);
  else {
    const separator = format === "srt" ? "," : ".";
    content = (format === "vtt" ? "WEBVTT\n\n" : "") + cues.filter(cue => cue.text.trim()).map((cue, index) => {
      const escaped = cue.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n\s*\n/g, "\n");
      return `${index + 1}\n${exportTimestamp(cue.start, separator)} --> ${exportTimestamp(cue.end, separator)}\n${escaped}\n`;
    }).join("\n");
  }
  const mime = format === "json" ? "application/json" : format === "vtt" ? "text/vtt" : "application/x-subrip";
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `alphanist-subtitles-edited.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.getElementById("caption-reset").addEventListener("click", () => {
  if (!window.confirm("Reset all subtitle text and timings to the original version? Your local edits will be replaced.")) return;
  cues = structuredClone(originals);
  following = true;
  selectCue(Math.max(0, activeCue()));
  paintCaptions();
  saveCaptions();
});

if (document.fullscreenEnabled && frame.requestFullscreen) {
  fullButton.hidden = false;
  fullButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch { fullButton.title = "Fullscreen is unavailable in this browser"; }
  });
  document.addEventListener("fullscreenchange", () => {
    const label = document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen with subtitles";
    fullButton.setAttribute("aria-label", label);
    fullButton.title = label;
    sizeCaptions();
  });
}

async function loadCaptions() {
  try {
    const response = await fetch(player.querySelector("track").src, { cache: "no-cache" });
    if (!response.ok) throw new Error("Subtitles unavailable");
    const source = await response.text();
    originals = parseCaptions(source);
    if (!validCues(originals)) throw new Error("Invalid subtitles");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    storageKey = `alphanist:subtitle-review:v1:${location.pathname}:${fingerprint}`;
    cues = structuredClone(originals);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved?.schema_version === 1 && saved.fingerprint === fingerprint && saved.cues?.length === cues.length && validCues(saved.cues)) {
        cues = saved.cues.map(({ start, end, text }) => ({ start, end, text }));
        captionsEnabled = saved.enabled !== false;
        if (Number.isFinite(saved.size) && saved.size >= 24 && saved.size <= 48) sizeField.value = saved.size;
        if (["below", "over"].includes(saved.placement)) placementField.value = saved.placement;
        saveStatus.textContent = "Local edits restored";
      }
    } catch { saveStatus.textContent = "Autosave unavailable — export edits"; }
    document.getElementById("caption-fields").disabled = false;
    captionToggle.setAttribute("aria-pressed", String(captionsEnabled));
    captionToggle.textContent = captionsEnabled ? "Subtitles on" : "Subtitles off";
    frame.classList.toggle("caption-below", placementField.value === "below");
    selectCue(Math.max(0, activeCue()));
    sizeCaptions();
    paintCaptions();
  } catch {
    captionStatus.textContent = "Subtitles could not be loaded. Reload to retry; the film still plays.";
  }
}
loadCaptions();

const initialTime = new URLSearchParams(location.search).get("t");
if (initialTime !== null && initialTime.trim() && Number.isFinite(Number(initialTime)) && Number(initialTime) >= 0) seek(Number(initialTime));
