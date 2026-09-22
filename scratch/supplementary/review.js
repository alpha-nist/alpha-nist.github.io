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

function timestamp(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
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
  const end = Number.isFinite(player.duration) ? Math.max(0, player.duration - 0.01) : 300;
  player.currentTime = Math.min(requestedTime, end);
  requestedTime = null;
}

function updatePosition(time = player.currentTime) {
  currentTime.textContent = timestamp(time);
  const sectionIndex = sections.findIndex(section => time >= section.start && time < section.end);
  const nextSection = sectionIndex >= 0 ? sectionIndex : time >= 300 ? sections.length - 1 : -1;
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
  for (const behavior of story.behavior_names || []) {
    const button = makeElement("button", "behavior", behavior.name);
    button.type = "button";
    button.title = behavior.description || "";
    button.setAttribute("aria-controls", "film-player");
    button.append(makeElement("time", "", timestamp(behavior.time)));
    button.addEventListener("click", () => seek(behavior.time));
    behaviorContainer.append(button);
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

player.addEventListener("loadedmetadata", applyRequestedTime);
player.addEventListener("timeupdate", () => updatePosition(requestedTime ?? player.currentTime));
player.addEventListener("seeked", () => updatePosition());
player.addEventListener("ended", () => updatePosition());

fetch("story.json", { cache: "no-cache" })
  .then(response => {
    if (!response.ok) throw new Error("Story unavailable");
    return response.json();
  })
  .then(renderStory)
  .catch(() => {
    chapterContainer.setAttribute("aria-busy", "false");
    document.getElementById("data-error").hidden = false;
  });

fetch("captions.srt", { method: "HEAD" })
  .then(response => { document.getElementById("srt-download").hidden = !response.ok; })
  .catch(() => {});
