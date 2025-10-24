// 📌 URL Google Sheet đã encode
const encodedSheetUrl =
  "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvZS8yUEFDWC0xdlJXbWltYUVGNy1ON3ZmOXhsNTdCay1pc1lOWUNmY2xaT2Q4WWNDZ3FjTWh1SG5YSGR5MUFqQ2N2dVFiNG5wX2xSaWZSTDZXUkROY2JGMi9wdWI/b3V0cHV0PWNzdg==";
const sheetUrl = atob(encodedSheetUrl);

// 📺 DOM
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

// 🧠 Biến trạng thái
let videoList = [];
let currentIndex = 0;
let hls = null;
let loadTimeout = null;
let isLoading = false;
let hasPlayed = false;
let lastScrollTime = 0;
const SCROLL_COOLDOWN = 800;

// 📜 Lazy render config
const PAGE_SIZE = 30;
let renderedCount = 0;
let lazyLoading = false;

// 🕒 Lưu thông tin video đã xem
let watchedVideos = JSON.parse(localStorage.getItem("watchedVideos") || "{}");

// 📥 Lấy danh sách video
async function loadVideoList(forceReload = false) {
  const saved = localStorage.getItem("videos");
  seekBar.disabled = true;

  if (saved && !forceReload) {
    videoList = JSON.parse(saved);
    renderVideoList(true);
    loadVideo(0);
    return;
  }

  try {
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
    renderVideoList(true);
    loadVideo(0);
  } catch (e) {
    console.error("Lỗi khi lấy video:", e);
    if (saved) {
      videoList = JSON.parse(saved);
      renderVideoList(true);
      loadVideo(0);
    }
  }
}

// 📺 Load video
function loadVideo(index) {
  if (!videoList.length || isLoading) return;

  isLoading = true;
  hasPlayed = false;
  currentIndex = (index + videoList.length) % videoList.length;

  highlightCurrentVideo();
  const url = videoList[currentIndex].url;
  seekBar.disabled = true;

  // cleanup video cũ
  if (hls) {
    hls.destroy();
    hls = null;
  }
  player.pause();
  player.classList.remove("showing");
  player.removeAttribute("src");
  player.load();

  videoTitle.textContent = `Video #${videoList[currentIndex].id}`;
  hideError();
  showLoading();

  setTimeout(() => {
    player.muted = true;
    updateMuteIcon();

    if (url.endsWith(".m3u8")) {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(player);
        hls.on(Hls.Events.MANIFEST_PARSED, safePlay);
        hls.on(Hls.Events.ERROR, showLoadError);
      } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
        player.src = url;
        safePlay();
      } else {
        showLoadError();
      }
    } else {
      player.src = url;
      safePlay();
    }

    player.onerror = () => showLoadError();

    player.onplaying = () => {
      hasPlayed = true;
      clearTimeout(loadTimeout);
      hideLoading();
      seekBar.disabled = false;
      isLoading = false;
      player.classList.add("showing");

      // 📝 Lưu thời gian xem
      const now = new Date();
      const formatted = now.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      watchedVideos[videoList[currentIndex].id] = formatted;
      localStorage.setItem("watchedVideos", JSON.stringify(watchedVideos));
      updateWatchedStatus();
    };

    loadTimeout = setTimeout(() => {
      if (!hasPlayed) showLoadError();
    }, 10000);
  }, 200);
}

// 📝 Render danh sách video
function renderVideoList(reset = false) {
  if (reset) {
    renderedCount = 0;
    videoListContainer.innerHTML = "";
  }

  const end = Math.min(renderedCount + PAGE_SIZE, videoList.length);
  for (let i = renderedCount; i < end; i++) {
    const video = videoList[i];
    const li = document.createElement("li");
    li.className = "flex items-start p-2 cursor-pointer";

    // 📌 Thay vì thumbnail — dùng màu nền
    const thumb = document.createElement("div");
    thumb.className = "w-20 h-12 bg-gray-800 rounded mb-1 flex items-center justify-center text-xs text-gray-400";
    thumb.textContent = `#${video.id}`;

    const info = document.createElement("div");
    info.className = "text-sm text-white";
    info.textContent = `Video #${video.id}`;

    const watched = document.createElement("div");
    watched.className = "text-xs text-gray-400 italic mt-1 watched-time";

    if (watchedVideos[video.id]) {
      watched.textContent = `Đã xem: ${watchedVideos[video.id]}`;
    }

    li.appendChild(thumb);
    li.appendChild(info);
    li.appendChild(watched);
    li.addEventListener("click", () => loadVideo(i));
    videoListContainer.appendChild(li);
  }

  renderedCount = end;
  lazyLoading = false;
  highlightCurrentVideo();
}

// 🔁 Cập nhật dòng “Đã xem” sau khi xem xong
function updateWatchedStatus() {
  const items = videoListContainer.querySelectorAll("li");
  items.forEach((item, i) => {
    const id = videoList[i].id;
    const watchedEl = item.querySelector(".watched-time");
    if (watchedVideos[id]) {
      watchedEl.textContent = `Đã xem: ${watchedVideos[id]}`;
    } else {
      watchedEl.textContent = "";
    }
  });
}

// ✨ Highlight video đang phát
function highlightCurrentVideo() {
  const allItems = videoListContainer.querySelectorAll("li");
  allItems.forEach((item, i) =>
    item.classList.toggle("active-video", i === currentIndex)
  );

  const activeItem = videoListContainer.querySelector("li.active-video");
  if (activeItem) {
    activeItem.scrollIntoView({
      block: "nearest",
      behavior: "smooth"
    });
  }
}


// ⚠️ Lỗi & loading
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
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function safePlay() {
  const p = player.play();
  if (p !== undefined) {
    p.catch(err => {
      if (err.name !== "AbortError") {
        console.warn("Autoplay lỗi khác:", err);
      }
    });
  }
}


// 🔇 Mute
muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  player.muted = !player.muted;
  updateMuteIcon();
});

function updateMuteIcon() {
  muteBtn.innerHTML = player.muted ?
    `<i class="ri-volume-mute-line ri-xl"></i>` :
    `<i class="ri-volume-up-line ri-xl"></i>`;
}

// 🖱️ Click video => pause/play
document.querySelector(".video-container").addEventListener("click", (e) => {
  if (e.target === muteBtn) return;
  if (player.paused) {
    player.play();
    showPlayPauseIcon("pause");
  } else {
    player.pause();
    showPlayPauseIcon("play");
  }
});

function showPlayPauseIcon(state) {
  playPauseOverlay.classList.remove("hidden");
  playPauseOverlay.querySelector("i").className =
    state === "play" ? "ri-play-fill text-white text-6xl" : "ri-pause-fill text-white text-6xl";
  setTimeout(() => playPauseOverlay.classList.add("hidden"), 600);
}

// ⏪ Tua & tốc độ
player.addEventListener("timeupdate", () => {
  if (player.duration && isFinite(player.duration)) {
    seekBar.value = (player.currentTime / player.duration) * 100;
  }
});
let wasPlaying = false;

seekBar.addEventListener("mousedown", () => {
  // Ghi nhận trạng thái phát
  wasPlaying = !player.paused;
  // Tạm dừng khi người dùng bắt đầu tua
  player.pause();
});

seekBar.addEventListener("input", () => {
  if (player.duration && isFinite(player.duration)) {
    player.currentTime = (seekBar.value / 100) * player.duration;
  }
});

seekBar.addEventListener("mouseup", () => {
  // Nếu trước đó video đang phát → phát lại sau khi tua
  if (wasPlaying) {
    safePlay();
  }
});

speedSelect.addEventListener("change", () => {
  player.playbackRate = parseFloat(speedSelect.value);
});

seekBar.addEventListener("touchstart", () => {
  wasPlaying = !player.paused;
  player.pause();
});

seekBar.addEventListener("touchend", () => {
  if (wasPlaying) safePlay();
});


// ⬆⬇ Cuộn để chuyển video
document.querySelector(".video-container").addEventListener("wheel", (e) => {
  const now = Date.now();
  if (isLoading || now - lastScrollTime < SCROLL_COOLDOWN) return;
  lastScrollTime = now;
  if (e.deltaY > 0) loadVideo(currentIndex + 1);
  else loadVideo(currentIndex - 1);
});

// 📜 Tự động load thêm khi cuộn gần cuối
videoListContainer.addEventListener("scroll", () => {
  const {
    scrollTop,
    scrollHeight,
    clientHeight
  } = videoListContainer;
  if (!lazyLoading && scrollTop + clientHeight >= scrollHeight - 50 && renderedCount < videoList.length) {
    lazyLoading = true;
    renderVideoList();
  }
});

// ⏭ Nút điều khiển
prevBtn.addEventListener("click", () => loadVideo(currentIndex - 1));
nextBtn.addEventListener("click", () => loadVideo(currentIndex + 1));
reloadBtn.addEventListener("click", () => loadVideoList(true));
// ⏭ Tự động chuyển video khi phát xong
player.addEventListener("ended", () => {
  loadVideo(currentIndex + 1);
});

// 🚀 Khởi động
loadVideoList();