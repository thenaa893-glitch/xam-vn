// ===========================
// 🔗 Google Sheet URL
// ===========================
const encodedSheetUrl =
  "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvZS8yUEFDWC0xdlJXbWltYUVGNy1ON3ZmOXhsNTdCay1pc1lOWUNmY2xaT2Q4WWNDZ3FjTWh1SG5YSGR5MUFqQ2N2dVFiNG5wX2xSaWZSTDZXUkROY2JGMi9wdWI/b3V0cHV0PWNzdg==";
const sheetUrl = atob(encodedSheetUrl);

// ===========================
// 🧠 DOM Elements
// ===========================
const player = document.getElementById("player");
const seekBar = document.getElementById("seekBar");
const speedSelect = document.getElementById("speed");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const reloadBtn = document.getElementById("reloadBtn");
const muteBtn = document.getElementById("muteBtn");
const videoTitle = document.getElementById("videoTitle");
const playPauseOverlay = document.getElementById("playPauseOverlay");
const errorOverlay = document.getElementById("errorOverlay");
const loadingOverlay = document.getElementById("loadingOverlay");
const videoListContainer = document.getElementById("videoListContainer");
const pausedOverlay = document.getElementById("pausedOverlay");
const resumeBtn = document.getElementById("resumeBtn");


// ===========================
// 🧭 State
// ===========================
let videoList = [];
let currentIndex = 0;
let hls = null;
let loadTimeout = null;
let isLoading = false;
let hasPlayed = false;
let lastScrollTime = 0;
const SCROLL_COOLDOWN = 800;
let timeSaveInterval = null;

let userMuted = JSON.parse(localStorage.getItem("userMuted") || "true");
const LAST_VIDEO_KEY = "lastWatchedVideoIndex";
const LAST_TIME_KEY = "lastWatchedVideoTime";
let watchedVideos = JSON.parse(localStorage.getItem("watchedVideos") || "{}");

// ===========================
// 🚀 Init after DOM ready
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  loadVideoList();
});

// ===========================
// 📥 Lấy danh sách video
// ===========================
async function loadVideoList(forceReload = false) {
  try {
    const saved = localStorage.getItem("videos");
    seekBar.disabled = true;

    if (saved && !forceReload) {
      videoList = JSON.parse(saved);
      renderVideoList();
      resumeLastVideo();
      return;
    }

    const res = await fetch(sheetUrl);
    const text = await res.text();
    videoList = text
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => {
        const [id, url] = line.split(",");
        return {
          id: id.trim(),
          url: url.trim()
        };
      });

    localStorage.setItem("videos", JSON.stringify(videoList));
    renderVideoList();
    resumeLastVideo();
  } catch (e) {
    console.error("❌ Lỗi khi lấy video:", e);
    const saved = localStorage.getItem("videos");
    if (saved) {
      videoList = JSON.parse(saved);
      renderVideoList();
      resumeLastVideo();
    } else {
      errorOverlay.classList.remove("hidden");
    }
  }
}

// ===========================
// ▶️ Load video
// ===========================
// ===========================
// ▶️ Load video (phiên bản tối ưu)
// ===========================
function loadVideo(index, resumeTime = 0, direction = "up") {
  if (!videoList.length || isLoading) return;

  clearInterval(timeSaveInterval);
  isLoading = true;
  hasPlayed = false;
  currentIndex = (index + videoList.length) % videoList.length;

  localStorage.setItem(LAST_VIDEO_KEY, currentIndex);
  highlightCurrentVideo();

  const url = videoList[currentIndex].url;
  seekBar.disabled = true;

  // 🧹 Cleanup video cũ
  if (hls) {
    hls.destroy();
    hls = null;
  }
  player.pause();
  player.removeAttribute("src");
  player.preload = "metadata"; // ✅ preload metadata giúp load nhanh hơn
  player.load();
  player.classList.remove("showing");

  videoTitle.textContent = `Video #${videoList[currentIndex].id}`;
  hideError();
  showLoading();

  // ===========================
  // 🎞️ Hiệu ứng chuyển cảnh
  // ===========================
  player.classList.remove(
    "video-slide-up-exit",
    "video-slide-up-exit-active",
    "video-slide-up-enter",
    "video-slide-up-enter-active",
    "video-slide-down-exit",
    "video-slide-down-exit-active",
    "video-slide-down-enter",
    "video-slide-down-enter-active"
  );

  // Áp dụng hiệu ứng thoát (slide lên/xuống)
  player.classList.add(`video-slide-${direction}-exit`);
  requestAnimationFrame(() => {
    player.classList.add(`video-slide-${direction}-exit-active`);
  });

  // Sau 150ms thì đổi video mới
  setTimeout(() => {
    player.classList.remove(
      `video-slide-${direction}-exit`,
      `video-slide-${direction}-exit-active`
    );

    // Áp dụng hiệu ứng xuất hiện video mới
    player.classList.add(`video-slide-${direction}-enter`);
    requestAnimationFrame(() => {
      player.classList.add(`video-slide-${direction}-enter-active`);
    });

    setTimeout(() => {
      player.muted = userMuted;
      updateMuteIcon();

      // ===========================
      // 🎬 Load video theo định dạng
      // ===========================
      if (url.endsWith(".m3u8")) {
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(player);
          hls.on(Hls.Events.MANIFEST_PARSED, () => safePlay(resumeTime));
          hls.on(Hls.Events.ERROR, showLoadError);
        } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
          player.src = url;
          safePlay(resumeTime);
        } else {
          showLoadError();
        }
      } else {
        player.src = url;
        safePlay(resumeTime);
      }

      player.onerror = () => showLoadError();

      player.onplaying = () => {
        hasPlayed = true;
        clearTimeout(loadTimeout);
        hideLoading();
        seekBar.disabled = false;
        isLoading = false;
        player.classList.add("showing");

        // ✅ Lưu lại thời gian đang xem để resume
        timeSaveInterval = setInterval(() => {
          if (!player.paused && player.currentTime > 0) {
            localStorage.setItem(LAST_TIME_KEY, player.currentTime);
          }
        }, 1000);

        // 🔮 Preload metadata của video kế tiếp
        const nextIndex = (currentIndex + 1) % videoList.length;
        const nextUrl = videoList[nextIndex].url;
        const preloadVideo = document.createElement("video");
        preloadVideo.preload = "metadata";
        preloadVideo.src = nextUrl;
        preloadVideo.muted = true;
        preloadVideo.load();
      };

      // 🔁 Khi phát xong → tự chuyển video tiếp theo
      player.onended = () => loadVideo(currentIndex + 1, 0, "up");

      // ⏳ Timeout an toàn 20s
      loadTimeout = setTimeout(() => {
        if (!hasPlayed) showLoadError();
      }, 20000);
    }, 150);
  }, 150);
}



// ===========================
// 🕒 Resume video cuối
// ===========================
function resumeLastVideo() {
  const lastIndex = parseInt(localStorage.getItem(LAST_VIDEO_KEY));
  const resumeTime = parseFloat(localStorage.getItem(LAST_TIME_KEY)) || 0;
  if (!isNaN(lastIndex) && lastIndex >= 0 && lastIndex < videoList.length) {
    loadVideo(lastIndex, resumeTime);
  } else {
    loadVideo(0);
  }
}

// ===========================
// 📝 Render danh sách video
// ===========================
function renderVideoList() {
  videoListContainer.innerHTML = "";
  videoList.forEach((video, index) => {
    const li = document.createElement("li");
    li.className =
      "flex items-center justify-between px-2 py-2 hover:bg-gray-800/30 transition";

    const thumb = document.createElement("div");
    thumb.className =
      "w-16 h-9 rounded bg-gradient-to-r from-primary to-secondary flex items-center justify-center text-xs font-bold";
    thumb.textContent = `#${video.id}`;

    const info = document.createElement("div");
    info.className = "flex-1 ml-2 text-sm truncate";
    const watched = watchedVideos[video.id];
    info.textContent = watched ? `Đã xem: ${watched}` : `Chưa xem`;

    li.appendChild(thumb);
    li.appendChild(info);
    li.addEventListener("click", () => loadVideo(index));

    videoListContainer.appendChild(li);
  });

  highlightCurrentVideo();
}

// ===========================
// ✨ Highlight video
// ===========================
function highlightCurrentVideo() {
  const allItems = videoListContainer.querySelectorAll("li");
  allItems.forEach((item, i) =>
    item.classList.toggle("bg-gray-800/50", i === currentIndex)
  );

  const currentVideo = videoList[currentIndex];
  const now = new Date();
  const formattedTime = `${now.getDate().toString().padStart(2, "0")}-${(
    now.getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${now.getFullYear()} ${now
    .getHours()
    .toString()
    .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now
    .getSeconds()
    .toString()
    .padStart(2, "0")}`;
  watchedVideos[currentVideo.id] = formattedTime;
  localStorage.setItem("watchedVideos", JSON.stringify(watchedVideos));

  const infoEl = allItems[currentIndex].querySelector(".flex-1");
  if (infoEl) infoEl.textContent = `Đã xem: ${formattedTime}`;
}

// ===========================
// ⏳ Lỗi & Loading
// ===========================
function showLoadError() {
  clearTimeout(loadTimeout);
  hideLoading();
  errorOverlay.classList.remove("hidden");
  setTimeout(() => {
    hideError();
    isLoading = false;
    loadVideo(currentIndex + 1);
  }, 2000);
}

function hideError() {
  errorOverlay.classList.add("hidden");
}

function showLoading() {
  if (!loadingOverlay.classList.contains("show")) {
    loadingOverlay.classList.add("show");
    loadingOverlay.style.backdropFilter = "blur(6px)";
  }
}

function hideLoading() {
  loadingOverlay.classList.remove("show");
  loadingOverlay.style.backdropFilter = "blur(4px)";
}

function safePlay(time = 0) {
  if (time > 0) player.currentTime = time;
  const p = player.play();
  if (p !== undefined) p.catch(() => {});
}

// ===========================
// 🔇 Mute
// ===========================
muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  userMuted = !userMuted;
  localStorage.setItem("userMuted", JSON.stringify(userMuted));
  player.muted = userMuted;
  updateMuteIcon();
});

function updateMuteIcon() {
  muteBtn.innerHTML = player.muted ?
    `<i class="ri-volume-mute-line ri-xl"></i>` :
    `<i class="ri-volume-up-line ri-xl"></i>`;
}

// ===========================
// 🖱️ Click video Pause/Play
// ===========================
document.querySelector(".video-container").addEventListener("click", (e) => {
  if (e.target === muteBtn) return;
  if (player.paused) {
    player.play();
    // showPlayPauseIcon("pause");
  } else {
    player.pause();
    // player.classList.remove("showing");
    // showPlayPauseIcon("play");
  }
});

// function showPlayPauseIcon(state) {
//   playPauseOverlay.classList.remove("hidden");
//   playPauseOverlay.querySelector("i").className =
//     state === "play" ?
//     "ri-play-fill text-white text-6xl" :
//     "ri-pause-fill text-white text-6xl";
//   setTimeout(() => playPauseOverlay.classList.add("hidden"), 600);
// }

// ===========================
// ⏪ Tua & tốc độ
// ===========================
player.addEventListener("timeupdate", () => {
  if (player.duration && isFinite(player.duration)) {
    seekBar.value = (player.currentTime / player.duration) * 100;
  }
});
seekBar.addEventListener("input", () => {
  if (player.duration && isFinite(player.duration)) {
    showLoading(); // 👈 hiện loading khi tua
    player.currentTime = (seekBar.value / 100) * player.duration;
    player.play(); // tua xong tự phát
  }
});
speedSelect.addEventListener("change", () => {
  player.playbackRate = parseFloat(speedSelect.value);
});
// Khi video pause -> show overlay
player.addEventListener("pause", () => {
  if (!player.ended) {
    pausedOverlay.classList.add("show");
  }
});

// Khi video phát -> ẩn overlay
player.addEventListener("play", () => {
  pausedOverlay.classList.remove("show");
});
player.addEventListener("playing", () => {
  hideLoading(); // 👈 ẩn loading khi video phát trở lại
});
// Nút resume
pausedOverlay.addEventListener("click", () => {
  player.play();
});
// ===========================
// ⬆⬇ Cuộn để chuyển
// ===========================
// PC scroll
document.querySelector(".video-container").addEventListener("wheel", (e) => {
  const now = Date.now();
  if (isLoading || now - lastScrollTime < SCROLL_COOLDOWN) return;
  lastScrollTime = now;
  if (e.deltaY > 0) loadVideo(currentIndex + 1, 0, "up");
  else loadVideo(currentIndex - 1, 0, "down");
});

// Mobile swipe
let touchStartY = 0;
let touchEndY = 0;
const videoContainer = document.querySelector(".video-container");

videoContainer.addEventListener("touchstart", (e) => {
  touchStartY = e.touches[0].clientY;
});
videoContainer.addEventListener("touchend", (e) => {
  touchEndY = e.changedTouches[0].clientY;
  const swipeDistance = touchEndY - touchStartY;
  if (Math.abs(swipeDistance) < 50) return;
  if (swipeDistance > 0) loadVideo(currentIndex - 1, 0, "down");
  else loadVideo(currentIndex + 1, 0, "up");
});


// ===========================
// ⏭ Buttons
// ===========================
prevBtn.addEventListener("click", () => loadVideo(currentIndex - 1));
nextBtn.addEventListener("click", () => loadVideo(currentIndex + 1));
reloadBtn.addEventListener("click", () => loadVideoList(true));