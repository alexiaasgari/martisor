(() => {
  // Ensure the DOM is available before we query for elements.
  // This makes the file safe to load from <head> (or via bundlers) without breaking.
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {

/*
  Mărțișor — WhatsApp-style mock
  - Slower, more sporadic chat-list intro animation
  - Special interactive threads:
      • Event Details (includes the green outgoing martisor.gif bubble + RSVP popup link)
      • Art Details (concept sketch + 3 lines + optional martisor-scans.gif)
      • Mărțișor History (text sequence)
      • RSVP (embedded Tally iframe inside the chat)
      • Thank you for support (optional org logos + links)
  - No contenteditable anywhere
  - No hide/reveal address panel
  - Fixed avatars for special threads
  - Generic chats cycle through avatar + preview options before repeating
*/

const app = document.getElementById("app");
const chatList = document.getElementById("chatList");
const backBtn = document.getElementById("backBtn");
const replayBtn = document.getElementById("replayBtn");

const chatNameEl = document.getElementById("chatName");
const chatStatusEl = document.getElementById("chatStatus");
const chatAvatarEl = document.getElementById("chatAvatar");
const chatAvatarImg = document.getElementById("chatAvatarImg");

const dynamicMount = document.getElementById("dynamicMount");

// Fail safely if the HTML structure isn't present.
// IMPORTANT: This must *stop* execution, otherwise later code will throw.
if (!app || !chatList || !dynamicMount || !chatNameEl || !chatStatusEl || !chatAvatarEl || !chatAvatarImg) {
  // eslint-disable-next-line no-console
  console.warn("Missing required DOM nodes — app.js not initialized.");
  return;
}


// -----------------------------
// Phone fit-to-screen scaling (keeps the whole UI proportional)
// -----------------------------

const phoneScaleWrap = document.querySelector(".phone-scale");
const phoneEl = document.querySelector(".phone");
const stageEl = document.querySelector(".stage");
const logoEl = document.querySelector(".event-logo");

function numberFromPx(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function getViewportBox() {
  const vv = window.visualViewport;
  if (vv) return { width: vv.width, height: vv.height };
  return { width: window.innerWidth, height: window.innerHeight };
}

function updatePhoneScale() {
  if (!phoneScaleWrap || !phoneEl) return;

  // Don't fight the user:
  // - When the on-screen keyboard opens (a form field / iframe is focused), visualViewport shrinks.
  //   Re-scaling then makes the UI "jump" while someone is typing.
  // - When pinch-zooming, visualViewport dimensions change; re-scaling causes a jittery feedback loop.
  // In both cases, keep the existing scale until the interaction ends.
  const vv = window.visualViewport;
  const isPinchZooming = !!(vv && Number.isFinite(vv.scale) && Math.abs(vv.scale - 1) > 0.01);
  const ae = document.activeElement;
  const isTypingTarget = !!(
    ae &&
    (ae.tagName === "INPUT" ||
      ae.tagName === "TEXTAREA" ||
      ae.tagName === "SELECT" ||
      ae.tagName === "IFRAME" ||
      ae.isContentEditable === true)
  );
  if (isPinchZooming || isTypingTarget) return;

  // Reset to natural sizing for measurement
  phoneScaleWrap.classList.remove("is-scaled");
  phoneScaleWrap.style.width = "";
  phoneScaleWrap.style.height = "";
  phoneEl.style.transform = "";
  phoneEl.style.transformOrigin = "";

  const baseRect = phoneEl.getBoundingClientRect();
  const baseW = baseRect.width;
  const baseH = baseRect.height;
  if (!baseW || !baseH) return;

  const { width: vw, height: vh } = getViewportBox();

  let availW = vw;
  let availH = vh;

  if (stageEl) {
    const cs = getComputedStyle(stageEl);
    availW -= numberFromPx(cs.paddingLeft) + numberFromPx(cs.paddingRight);
    availH -= numberFromPx(cs.paddingTop) + numberFromPx(cs.paddingBottom);
  }

  // On mobile layout, the logo sits above the phone — subtract its height too.
  const isStacked = window.matchMedia("(max-width: 860px)").matches;
  if (isStacked && logoEl) {
    const logoRect = logoEl.getBoundingClientRect();
    const stageStyles = stageEl ? getComputedStyle(stageEl) : null;
    const gap = stageStyles ? numberFromPx(stageStyles.rowGap || stageStyles.gap) : 0;
    availH -= logoRect.height + gap;
  }

  // Small buffer so the phone never kisses the viewport edges
  availW -= 12;
  availH -= 12;

  const scale = Math.min(1, availW / baseW, availH / baseH);

  if (scale < 0.999) {
    phoneScaleWrap.classList.add("is-scaled");
    phoneScaleWrap.style.width = `${baseW * scale}px`;
    phoneScaleWrap.style.height = `${baseH * scale}px`;

    phoneEl.style.transformOrigin = "top left";
    phoneEl.style.transform = `scale(${scale})`;
  }
}

// Keep it fitted on resize / orientation changes (also handles mobile browser UI changes)
const schedulePhoneScaleUpdate = () => requestAnimationFrame(updatePhoneScale);
window.addEventListener("resize", schedulePhoneScaleUpdate);
window.addEventListener("orientationchange", schedulePhoneScaleUpdate);
window.addEventListener("load", schedulePhoneScaleUpdate);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", schedulePhoneScaleUpdate);
  window.visualViewport.addEventListener("scroll", schedulePhoneScaleUpdate);
}

// Initial fit
schedulePhoneScaleUpdate();

// -----------------------------
// Helpers
// -----------------------------

let introToken = 0;
let sequenceToken = 0;
let introTimeoutId = null;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeShuffledCycle(items) {
  let bag = shuffle(items);
  let last = null;

  return function next() {
    if (bag.length === 0) {
      bag = shuffle(items);
      // Avoid immediate repeat across cycles.
      if (bag.length > 1 && bag[0] === last) {
        bag.push(bag.shift());
      }
    }
    const val = bag.shift();
    last = val;
    return val;
  };
}

function guardSequence(token) {
  return token === sequenceToken;
}

function scrollChatToBottom() {
  const chatScroll = document.querySelector("#pageChat .chat");
  if (!chatScroll) return;
  window.setTimeout(() => {
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }, 0);
}

function formatNowTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function updateStatusBarTimes() {
  const t = formatNowTime();
  document.querySelectorAll(".statusbar__time").forEach((el) => {
    el.textContent = t;
  });
}

function startClock() {
  updateStatusBarTimes();
  window.setInterval(updateStatusBarTimes, 1000);
}

function markAvatarFallback(containerEl, imgEl) {
  if (!containerEl || !imgEl) return;
  containerEl.classList.remove("is-missing");
  imgEl.addEventListener(
    "error",
    () => containerEl.classList.add("is-missing"),
    { once: true },
  );
}

function clearDynamicMessages() {
  if (!dynamicMount) return;
  dynamicMount.innerHTML = "";
  if (dynamicMount.dataset) dynamicMount.dataset.thread = "";
}

// -----------------------------
// Tally helpers (popup + embeds)
// -----------------------------

const TALLY_FORM_ID = "KYldG7";
const TALLY_SCRIPT_URL = "https://tally.so/widgets/embed.js";

function ensureTallyScriptLoaded() {
  return new Promise((resolve) => {
    if (typeof window.Tally !== "undefined" && typeof window.Tally.loadEmbeds === "function") {
      resolve(true);
      return;
    }

    const existing = document.querySelector(`script[src="${TALLY_SCRIPT_URL}"]`);
    if (existing) {
      // Script is present but may still be loading. Poll briefly.
      const startedAt = Date.now();
      const poll = window.setInterval(() => {
        if (typeof window.Tally !== "undefined" && typeof window.Tally.loadEmbeds === "function") {
          window.clearInterval(poll);
          resolve(true);
        } else if (Date.now() - startedAt > 2500) {
          window.clearInterval(poll);
          resolve(false);
        }
      }, 60);
      return;
    }

    const s = document.createElement("script");
    s.src = TALLY_SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function loadTallyEmbeds() {
  await ensureTallyScriptLoaded();

  // Preferred: Tally API
  if (typeof window.Tally !== "undefined" && typeof window.Tally.loadEmbeds === "function") {
    window.Tally.loadEmbeds();
    return;
  }

  // Fallback: set src from data-tally-src
  document
    .querySelectorAll('iframe[data-tally-src]:not([src])')
    .forEach((iframe) => {
      // eslint-disable-next-line no-param-reassign
      iframe.src = iframe.dataset.tallySrc;
    });
}

const RSVP_POPUP_LINK_HTML = `
  <a
    class="tally-popup-link"
    href="#tally-open=${TALLY_FORM_ID}&tally-emoji-text=👋&tally-emoji-animation=wave"
    data-tally-open="${TALLY_FORM_ID}"
    data-tally-emoji-text="👋"
    data-tally-emoji-animation="wave"
  >Click here for RSVP</a>
`;

const RSVP_EMBED_URL = `https://tally.so/embed/${TALLY_FORM_ID}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`;

function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

// Display a URL without the protocol so it looks cleaner in chat bubbles.
// (The underlying link still uses https:// so it remains clickable everywhere.)
function displayUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

// Art assets (we try a few paths so it works whether you store images in /images or project root)
const CONCEPT_IMAGE_CANDIDATES = [
  "images/conceptsketc.jpg",
  "conceptsketc.jpg",
  "images/conceptsketch.jpg",
  "conceptsketch.jpg",
];

let conceptImageUrl = CONCEPT_IMAGE_CANDIDATES[0];
let conceptImageResolved = false;

async function resolveConceptImageUrl() {
  if (conceptImageResolved) return conceptImageUrl;
  for (const c of CONCEPT_IMAGE_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await assetExists(c);
    if (ok) {
      conceptImageUrl = c;
      break;
    }
  }
  conceptImageResolved = true;
  return conceptImageUrl;
}

// -----------------------------
// Chat list data
// -----------------------------

const romanianNames = [
  "Ana Popescu",
  "Mihai Ionescu",
  "Ioana Dumitrescu",
  "Andrei Stan",
  "Elena Marinescu",
  "Radu Petrescu",
  "Cătălina Georgescu",
  "Ștefan Rusu",
  "Cristina Matei",
  "Vlad Popa",
  "Alina Toma",
  "Bogdan Enache",
  "Teodora Ilie",
  "Daria Stoica",
  "Sorin Dobre",
  "Irina Pavel",
  "Rareș Ciobanu",
  "Bianca Șerban",
  "Dragoș Vasile",
  "Maria Nistor",
  "Nicolette Cristea",
  "Gabriel Munteanu",
  "Oana Sava",
  "Mădălina Răduț",
  "Florin Neagu",
  "Alexia A",
  "Dinu Barbu",
  "Iulia Chiriac",
  "Săndel Păun",
  "Roxana Bîrsan",
];

const previewOptions = [
  "Happy Mărțișor!",
  "Noroc, sănătate și multă voie bună!",
  "Happy March 1st!",
  "Happy Spring!!!",
  "Un simbol mic pentru o prietenie mare. Să ai un Martie de vis!",
  "See you at the celebration!",
];

const timeOptions = [
  "11:08 AM",
  "12:44 AM",
  "9:11 AM",
  "8:33 AM",
  "Yesterday",
  "Yesterday",
  "7:02 AM",
  "6:18 AM",
  "10:29 PM",
];

const GENERIC_AVATARS = [
  "images/b.jpg",
  "images/c.jpg",
  "images/d.jpg",
  "images/e.jpg",
  "images/f.jpg",
  "images/g.jpg",
  "images/h.jpg",
];

const nextGenericAvatar = makeShuffledCycle(GENERIC_AVATARS);
const nextGenericPreview = makeShuffledCycle(previewOptions);

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDisplayName(fullName) {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return String(fullName).trim();
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0)}.`;
}

const SPECIAL = {
  event: {
    id: "event",
    name: "Event Details",
    preview: "Celebrate spring the Romanian way!",
    time: "12:30 PM",
    badge: "1",
    avatarSrc: "images/a.jpg",
    thread: "event",
  },
  art: {
    id: "art",
    name: "Art Details",
    preview: "Concept sketch + artist statement",
    time: "12:29 PM",
    badge: "1",
    avatarSrc: "images/b.jpg",
    thread: "art",
  },
  history: {
    id: "history",
    name: "Mărțișor History",
    preview: "What is Mărțișor?",
    time: "12:28 PM",
    badge: "1",
    avatarSrc: "images/c.jpg",
    thread: "history",
  },
  rsvp: {
    id: "rsvp",
    name: "RSVP",
    preview: "Tap to RSVP",
    time: "12:27 PM",
    badge: "1",
    avatarSrc: "images/d.jpg",
    thread: "rsvp",
  },
  support: {
    id: "support",
    name: "Thank you for support",
    preview: "Support the Art",
    time: "12:26 PM",
    badge: "1",
    avatarSrc: "images/e.jpg",
    thread: "support",
  },
};

function generateGenericChat() {
  const id = `c_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    name: formatDisplayName(pick(romanianNames)),
    preview: nextGenericPreview(),
    time: pick(timeOptions),
    badge: "99+",
    avatarSrc: nextGenericAvatar(),
    thread: "generic",
  };
}

function createChatRow(chat) {
  const row = document.createElement("div");
  row.className = "row is-entering";
  row.dataset.chatId = chat.id;

  const badgeText = String(chat.badge || "").trim();
  const badgeHtml = badgeText
    ? `<div class="badge" spellcheck="false">${badgeText}</div>`
    : "";

  row.innerHTML = `
    <div class="avatar">
      <img src="${chat.avatarSrc}" alt="" />
      <div class="avatar-fallback" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2-8 4.5V21h16v-2.5C20 16 16.42 14 12 14Z"/></svg>
      </div>
    </div>

    <div class="row__main">
      <div class="row__top">
        <div class="row__name" spellcheck="false">${chat.name}</div>
        <div class="row__time" spellcheck="false">${chat.time}</div>
      </div>
      <div class="row__bottom">
        <div class="row__preview" spellcheck="false">${chat.preview}</div>
        <div class="row__meta">
          ${badgeHtml}
        </div>
      </div>
    </div>
  `;

  const avatar = row.querySelector(".avatar");
  const avatarImg = row.querySelector(".avatar img");
  markAvatarFallback(avatar, avatarImg);

  row.addEventListener("click", () => {
    openChat(chat);
  });

  return row;
}

function addInitialChats(count = 10) {
  for (let i = 0; i < count; i += 1) {
    const chat = generateGenericChat();
    const row = createChatRow(chat);
    row.classList.remove("is-entering");
    row.classList.add("is-entered");
    chatList.appendChild(row);
  }
}

function stopIntro() {
  introToken += 1;
  if (introTimeoutId) {
    window.clearTimeout(introTimeoutId);
    introTimeoutId = null;
  }
}

function animateIntroThenOpen() {
  stopIntro();
  const token = introToken;

  const plan = [
    { type: "random" },
    { type: "special", key: "support" },
    { type: "special", key: "rsvp" },
    { type: "special", key: "history" },
    { type: "special", key: "art" },
    { type: "special", key: "event" },
  ];

  let idx = 0;
  let lastRow = null;

  const step = () => {
    if (token !== introToken) return;

    const entry = plan[idx];
    if (!entry) return;

    const chat =
      entry.type === "random" ? generateGenericChat() : { ...SPECIAL[entry.key] };

    const row = createChatRow(chat);
    chatList.prepend(row);

    // Animate row in
    requestAnimationFrame(() => row.classList.add("is-entered"));

    lastRow = row;
    idx += 1;

    // After the last insert (Event Details), highlight and auto-open.
    if (idx >= plan.length) {
      introTimeoutId = window.setTimeout(() => {
        if (token !== introToken) return;
        if (lastRow) lastRow.classList.add("is-selected");

        window.setTimeout(() => {
          if (token !== introToken) return;
          openChat(SPECIAL.event);
        }, 700);
      }, 600);
      return;
    }

    // Slower + irregular delay between incoming chats.
    const nextDelay = randInt(900, 1700);
    introTimeoutId = window.setTimeout(step, nextDelay);
  };

  // Give the list a beat before the first new chat appears.
  introTimeoutId = window.setTimeout(step, 900);
}

// -----------------------------
// Message builders
// -----------------------------

function createTypingMsg() {
  const msg = document.createElement("div");
  msg.className = "msg msg--incoming msg--typing";

  msg.innerHTML = `
    <div class="bubble bubble--incoming bubble--typing" aria-label="Typing">
      <div class="typing" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  return msg;
}

async function showTyping(token, durationMs = 900) {
  if (!guardSequence(token)) return;

  const typingEl = createTypingMsg();
  dynamicMount.appendChild(typingEl);
  chatStatusEl.textContent = "typing…";
  scrollChatToBottom();

  await sleep(durationMs);
  if (!guardSequence(token)) return;

  typingEl.remove();
  chatStatusEl.textContent = "online";
  scrollChatToBottom();
}

function createPhoto(src) {
  const photo = document.createElement("div");
  photo.className = "photo";

  const img = document.createElement("img");
  img.src = src;
  img.alt = "Attached image";

  const missing = document.createElement("div");
  missing.className = "photo__missing";
  missing.setAttribute("aria-hidden", "true");
  missing.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5 11 16.01l3.5-4.5L19 18H5l3.5-4.5Z"/></svg>';

  img.addEventListener(
    "error",
    () => {
      photo.classList.add("is-missing");
    },
    { once: true },
  );

  photo.appendChild(img);
  photo.appendChild(missing);
  return photo;
}

function appendTextMsg({ direction = "incoming", html = "", timeText = "" }) {
  const msg = document.createElement("div");
  msg.className = `msg msg--${direction}`;

  const bubble = document.createElement("div");
  bubble.className = `bubble bubble--${direction}`;

  const text = document.createElement("div");
  text.className = "bubble__text";
  text.innerHTML = html;

  bubble.appendChild(text);

  if (timeText) {
    const meta = document.createElement("div");
    meta.className = "bubble__meta";
    meta.innerHTML = `<span class="bubble__time" spellcheck="false">${timeText}</span>`;
    bubble.appendChild(meta);
  }

  msg.appendChild(bubble);
  dynamicMount.appendChild(msg);
  scrollChatToBottom();
  return msg;
}

function appendPhotoMsg({ direction = "incoming", src, caption = "", timeText = "", href = "" }) {
  const msg = document.createElement("div");
  msg.className = `msg msg--${direction}`;

  const bubble = document.createElement("div");
  bubble.className = `bubble bubble--${direction}`;

  const photoEl = createPhoto(src);

  if (href) {
    const a = document.createElement("a");
    a.className = "photo-link";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.appendChild(photoEl);
    bubble.appendChild(a);
  } else {
    bubble.appendChild(photoEl);
  }

  if (caption) {
    const cap = document.createElement("div");
    cap.className = "bubble__caption";
    cap.textContent = caption;
    bubble.appendChild(cap);
  }

  if (timeText) {
    const meta = document.createElement("div");
    meta.className = "bubble__meta";
    meta.innerHTML = `<span class="bubble__time" spellcheck="false">${timeText}</span>`;
    bubble.appendChild(meta);
  }

  msg.appendChild(bubble);
  dynamicMount.appendChild(msg);
  scrollChatToBottom();
  return msg;
}

function appendEmbedMsg({ title = "RSVP to Mărțișor Event" } = {}) {
  const msg = document.createElement("div");
  msg.className = "msg msg--incoming";

  const bubble = document.createElement("div");
  bubble.className = "bubble bubble--incoming bubble--embed";

  const wrap = document.createElement("div");
  wrap.className = "bubble__embed";

  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-tally-src", RSVP_EMBED_URL);
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("width", "100%");
  iframe.setAttribute("height", "356");
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("marginheight", "0");
  iframe.setAttribute("marginwidth", "0");
  iframe.setAttribute("title", title);

  wrap.appendChild(iframe);
  bubble.appendChild(wrap);
  msg.appendChild(bubble);
  dynamicMount.appendChild(msg);
  scrollChatToBottom();

  // Activate the embed (dynamic height, etc.)
  loadTallyEmbeds();

  return msg;
}

function assetExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// -----------------------------
// Thread content
// -----------------------------

const played = {
  event: false,
  art: false,
  history: false,
  support: false,
};

const EVENT_DETAILS_TEXTS = [
  "Celebrate spring the Romanian way!",
  "Experience the live creation of a <strong>large-scale Mărțișor</strong> — a work exploring memory.",
  "Join us for the performance, food, and community. Open to all.",
  "<strong>Sunday, March 1st @ 2:00 PM</strong>",
  "<strong>366 Devoe Street, Brooklyn</strong>",
  RSVP_POPUP_LINK_HTML,
];

const ART_DETAILS_TEXTS = [
  "The mărțișor is a Romanian spring tradition: a small braided token of red and white thread, exchanged on March 1st as a symbol of renewal and connection.",
  "Memory is sustained in presence and in practice. Through memory, objects and events become distorted but durational, carried by the collective, across time and place.",
  "Together we will weave a large mărțișor, strung with bead constructed of a large amalgamation of objects related to memory.",
];

const HISTORY_TEXTS = [
  "Mărțișor is an ancient Romanian celebration on March 1st marking the arrival of spring and the victory of light over winter.",
  "The name is a diminutive of Martie, literally translating to \"little March.\"",
  "The core symbol is a red and white twisted string representing the transition from the white of winter to the red vitality of spring.",
  "It was added to the UNESCO Intangible Cultural Heritage list in 2017 to preserve its historical and cultural significance.",
  "Historical roots date back over 2,000 years to Roman and Dacian times, possibly tied to the feast of the god Mars.",
  "People traditionally wear the string pinned to their clothing or around their wrist for the first 9 to 12 days of the month.",
  "In modern times, the string is usually attached to small charms like snowdrops, ladybugs, or four-leaf clovers for good luck.",
  "The tradition concludes by tying the red and white string to the branch of a flowering fruit tree to ensure health and prosperity.",
];

// Support thread assets (logos are optional and will only render if found)
const SUPPORT_RCI_LOGO_CANDIDATES = [
  "images/romanianculturalinstitute.jpg",
  "romanianculturalinstitute.jpg",
];

const SUPPORT_NYRG_LOGO_CANDIDATES = [
  "images/newyorkromaniansgroup.jpg",
  "newyorkromaniansgroup.jpg",
];

let supportAssetsResolved = false;
let supportRciLogoUrl = null;
let supportNyrgLogoUrl = null;

async function resolveSupportAssets() {
  if (supportAssetsResolved) {
    return {
      rciLogoUrl: supportRciLogoUrl,
      nyrgLogoUrl: supportNyrgLogoUrl,
    };
  }

  // Try candidates in order; if none found, keep url as null.
  for (const c of SUPPORT_RCI_LOGO_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await assetExists(c);
    if (ok) {
      supportRciLogoUrl = c;
      break;
    }
  }

  for (const c of SUPPORT_NYRG_LOGO_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await assetExists(c);
    if (ok) {
      supportNyrgLogoUrl = c;
      break;
    }
  }

  supportAssetsResolved = true;
  return {
    rciLogoUrl: supportRciLogoUrl,
    nyrgLogoUrl: supportNyrgLogoUrl,
  };
}

async function playEventDetails(token) {
  if (!guardSequence(token)) return;
  dynamicMount.dataset.thread = "event";

  // Green outgoing bubble (ONLY in Event Details)
  appendPhotoMsg({
    direction: "outgoing",
    src: "images/martisor.gif",
    caption: "Happy Mărțișor!",
    timeText: "",
  });

  await sleep(randInt(220, 520));
  if (!guardSequence(token)) return;

  // Incoming messages with typing in-between
  for (const html of EVENT_DETAILS_TEXTS) {
    await showTyping(token, randInt(850, 1500));
    if (!guardSequence(token)) return;

    appendTextMsg({ direction: "incoming", html });
    // Ensure popup link is wired up
    if (html.includes("data-tally-open")) loadTallyEmbeds();

    await sleep(randInt(320, 920));
    if (!guardSequence(token)) return;
  }

  // Embedded RSVP form (in-chat)
  await showTyping(token, randInt(520, 980));
  if (!guardSequence(token)) return;
  appendEmbedMsg();

  played.event = true;
}

function renderEventDetailsFinal() {
  dynamicMount.dataset.thread = "event";
  appendPhotoMsg({
    direction: "outgoing",
    src: "images/martisor.gif",
    caption: "Happy Mărțișor!",
  });
  EVENT_DETAILS_TEXTS.forEach((html) => appendTextMsg({ direction: "incoming", html }));
  appendEmbedMsg();
  loadTallyEmbeds();
}

async function playArtDetails(token) {
  if (!guardSequence(token)) return;
  dynamicMount.dataset.thread = "art";

  // Resolve asset path once (supports both /images and project root)
  await resolveConceptImageUrl();
  if (!guardSequence(token)) return;

  // Concept sketch image (as an image message)
  await showTyping(token, randInt(650, 1200));
  if (!guardSequence(token)) return;

  appendPhotoMsg({
    direction: "incoming",
    src: conceptImageUrl,
    caption: "",
  });

  await sleep(randInt(260, 640));
  if (!guardSequence(token)) return;

  for (const t of ART_DETAILS_TEXTS) {
    await showTyping(token, randInt(800, 1400));
    if (!guardSequence(token)) return;

    appendTextMsg({ direction: "incoming", html: t });
    await sleep(randInt(280, 760));
    if (!guardSequence(token)) return;
  }

  // Optional scans gif (only if it exists)
  const scansCandidates = ["images/martisor-scans.gif", "martisor-scans.gif"];
  let scansUrl = null;
  for (const c of scansCandidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await assetExists(c);
    if (ok) {
      scansUrl = c;
      break;
    }
  }

  if (scansUrl) {
    await showTyping(token, randInt(750, 1350));
    if (!guardSequence(token)) return;
    appendPhotoMsg({ direction: "incoming", src: scansUrl });
  }

  played.art = true;
}

function renderArtDetailsFinal() {
  dynamicMount.dataset.thread = "art";
  appendPhotoMsg({ direction: "incoming", src: conceptImageUrl });
  ART_DETAILS_TEXTS.forEach((t) => appendTextMsg({ direction: "incoming", html: t }));
  // Intentionally do not force-send martisor-scans.gif here; only if it exists at runtime.
}

async function playHistory(token) {
  if (!guardSequence(token)) return;
  dynamicMount.dataset.thread = "history";

  // Example image (shown first)
  await showTyping(token, randInt(650, 1200));
  if (!guardSequence(token)) return;
  appendPhotoMsg({ direction: "incoming", src: "images/martisor-example.png" });

  await sleep(randInt(220, 520));
  if (!guardSequence(token)) return;

  for (const t of HISTORY_TEXTS) {
    await showTyping(token, randInt(780, 1500));
    if (!guardSequence(token)) return;

    appendTextMsg({ direction: "incoming", html: t });
    await sleep(randInt(220, 620));
    if (!guardSequence(token)) return;
  }

  played.history = true;
}

function renderHistoryFinal() {
  dynamicMount.dataset.thread = "history";
  appendPhotoMsg({ direction: "incoming", src: "images/martisor-example.png" });
  HISTORY_TEXTS.forEach((t) => appendTextMsg({ direction: "incoming", html: t }));
}

async function playRSVP(token) {
  if (!guardSequence(token)) return;
  dynamicMount.dataset.thread = "rsvp";

  await showTyping(token, randInt(520, 980));
  if (!guardSequence(token)) return;

  appendEmbedMsg();
}

async function playSupport(token, { withTyping = true } = {}) {
  if (!guardSequence(token)) return;
  dynamicMount.dataset.thread = "support";

  // Links (kept here so they're easy to update; these values already exist in the file).
  const RCI_URL = "rciusa.info/";
  const NYRG_URL = "https://instagram.com/newyorkromaniangroup/";
  const VENMO_URL = "https://venmo.com/u/Alexia-Asgari";

  const rciSafeUrl = normalizeUrl(RCI_URL);
  const nyrgSafeUrl = normalizeUrl(NYRG_URL);
  const venmoSafeUrl = normalizeUrl(VENMO_URL);

  const rciLabel = displayUrl(rciSafeUrl) || rciSafeUrl;
  const nyrgLabel = displayUrl(nyrgSafeUrl) || nyrgSafeUrl;

  // Tip jar image (clickable) — try /images first, then project root.
  const TIPJAR_IMAGE_CANDIDATES = ["images/tipjar.gif", "tipjar.gif"];
  let tipJarSrc = TIPJAR_IMAGE_CANDIDATES[0];
  for (const c of TIPJAR_IMAGE_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await assetExists(c);
    if (ok) {
      tipJarSrc = c;
      break;
    }
  }

  const msgs = [
    {
      type: "text",
      html: "Thank you to the RCI and the NYRG for their support in cultivating community for this effort",
    },
    { type: "text", html: "Read more about the organizations:" },
    {
      type: "text",
      html: `<a href="${rciSafeUrl}" target="_blank" rel="noopener">${rciLabel}</a>`,
    },
    {
      type: "text",
      html: `<a href="${nyrgSafeUrl}" target="_blank" rel="noopener">${nyrgLabel}</a>`,
    },
    {
      type: "text",
      html: "If you would like to support the artists that put this together (Alexia Asgari and Nicolette Casalan):",
    },
    {
      type: "text",
      html: `<a href="${venmoSafeUrl}" target="_blank" rel="noopener">Click here to support <3</a>`,
    },
    // Show a tip jar image under the link; clicking the image opens Venmo.
    { type: "photo", src: tipJarSrc, href: venmoSafeUrl },
  ];

  for (const m of msgs) {
    if (withTyping) {
      await showTyping(token, randInt(650, 1200));
      if (!guardSequence(token)) return;
    }

    if (m.type === "photo") {
      appendPhotoMsg({ direction: "incoming", src: m.src, href: m.href });
    } else {
      appendTextMsg({ direction: "incoming", html: m.html });
    }

    if (withTyping) {
      await sleep(randInt(240, 620));
      if (!guardSequence(token)) return;
    }
  }


  played.support = true;
}

// -----------------------------
// Navigation
// -----------------------------

function openChat(chat) {
  if (!chat) return;

  // Stop intro if user interacts
  stopIntro();

  // Cancel any running message sequence
  sequenceToken += 1;
  const token = sequenceToken;

  // Update header
  chatNameEl.textContent = chat.name;
  chatStatusEl.textContent = "online";

  // Avatar in chat header
  chatAvatarEl.classList.remove("is-missing");
  chatAvatarImg.src = chat.avatarSrc;
  chatAvatarImg.onerror = () => chatAvatarEl.classList.add("is-missing");

  // Show chat page
  app.classList.add("show-chat");

  // Render messages
  clearDynamicMessages();

  if (chat.thread === "event") {
    if (played.event) {
      renderEventDetailsFinal();
    } else {
      playEventDetails(token);
    }
  } else if (chat.thread === "art") {
    if (played.art) {
      renderArtDetailsFinal();
    } else {
      playArtDetails(token);
    }
  } else if (chat.thread === "history") {
    if (played.history) {
      renderHistoryFinal();
    } else {
      playHistory(token);
    }
  } else if (chat.thread === "rsvp") {
    playRSVP(token);
  } else if (chat.thread === "support") {
    playSupport(token, { withTyping: !played.support });
  } else {
    // Generic chat (lightweight)
    appendTextMsg({ direction: "incoming", html: pick(previewOptions) });
  }

  scrollChatToBottom();
}

function closeChat() {
  sequenceToken += 1;
  app.classList.remove("show-chat");
}

function resetExperience() {
  stopIntro();
  sequenceToken += 1;

  // Reset special thread playback
  played.event = false;
  played.art = false;
  played.history = false;
  played.support = false;

  // Return to list view
  app.classList.remove("show-chat");

  // Clear chat + list
  clearDynamicMessages();
  chatList.innerHTML = "";

  // Rebuild + replay intro
  addInitialChats(10);
  animateIntroThenOpen();
}

// -----------------------------
// Wire events + init
// -----------------------------

if (backBtn) backBtn.addEventListener("click", closeChat);
if (replayBtn) replayBtn.addEventListener("click", resetExperience);

startClock();
// Pre-resolve the concept image path so it loads as soon as possible.
resolveConceptImageUrl();
addInitialChats(10);
animateIntroThenOpen();

  });
})();

