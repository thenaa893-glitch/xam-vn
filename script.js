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
const jumpIdInput = document.getElementById("jumpId");
const jumpBtn = document.getElementById("jumpBtn");
const videoTitle = document.getElementById("videoTitle");
const errorOverlay = document.getElementById("errorOverlay");
const loadingOverlay = document.getElementById("loadingOverlay");
const videoListContainer = document.getElementById("videoListContainer");
const pausedOverlay = document.getElementById("pausedOverlay");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarClose = document.getElementById("sidebarClose");
const videoListSidebar = document.getElementById("videoListSidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
// Seek control buttons
const seekBack10 = document.getElementById("seekBack10");
const seekFwd10 = document.getElementById("seekFwd10");
const seekBack30 = document.getElementById("seekBack30");
const seekFwd30 = document.getElementById("seekFwd30");
const seekBack60 = document.getElementById("seekBack60");
const seekFwd60 = document.getElementById("seekFwd60");

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

// ===========================
// 🛡️ Enhanced Error Handling State
// ===========================
let retryCount = 0;
const MAX_RETRIES = 3;
let retryTimeout = null;
let isOnline = navigator.onLine;
let failedVideos = new Set(); // Track failed video URLs
let videoValidationCache = new Map(); // Cache video validation results
let networkQuality = 'unknown'; // 'good', 'poor', 'unknown'

let userMuted = JSON.parse(localStorage.getItem("userMuted") || "true");
const LAST_VIDEO_KEY = "lastWatchedVideoIndex";
const LAST_TIME_KEY = "lastWatchedVideoTime";
let watchedVideos = JSON.parse(localStorage.getItem("watchedVideos") || "{}");

// ===========================
// 🚀 Init after DOM ready
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  setupNetworkMonitoring();
  setupSidebarToggle();
  loadVideoList();
  setupJumpToId();
});
// ===========================
// 🔢 Jump to Video by ID
// ===========================
function setupJumpToId() {
  if (!jumpBtn || !jumpIdInput) return;
  const trigger = () => {
    const raw = (jumpIdInput.value || '').trim();
    if (!raw) return;
    const targetIndex = videoList.findIndex(v => String(v.id) === raw);
    if (targetIndex !== -1) {
      loadVideo(targetIndex, 0);
      // Clear input after jump
      jumpIdInput.value = '';
    } else {
      showUserError(`Không tìm thấy video ID #${raw}`);
      setTimeout(() => hideError(), 1500);
    }
  };
  jumpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    trigger();
  });
  jumpIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      trigger();
    }
  });
}

// ===========================
// 🌐 Network Monitoring
// ===========================
function setupNetworkMonitoring() {
  // Monitor online/offline status
  window.addEventListener('online', () => {
    isOnline = true;
    // Retry loading if we were offline
    if (isLoading && retryCount < MAX_RETRIES) {
      retryLoadVideo();
    }
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    showNetworkError();
  });

  // Monitor network quality
  if ('connection' in navigator) {
    const connection = navigator.connection;
    updateNetworkQuality(connection.effectiveType);
    
    connection.addEventListener('change', () => {
      updateNetworkQuality(connection.effectiveType);
    });
  }
}

function updateNetworkQuality(effectiveType) {
  const qualityMap = {
    'slow-2g': 'poor',
    '2g': 'poor', 
    '3g': 'good',
    '4g': 'good'
  };
  networkQuality = qualityMap[effectiveType] || 'unknown';
}

function showNetworkError() {
  const errorMsg = document.querySelector('#errorOverlay span');
  if (errorMsg) {
    errorMsg.textContent = 'Không có kết nối mạng. Đang thử kết nối lại...';
  }
  errorOverlay.classList.remove('hidden');
}

// ===========================
// 📱 Sidebar Toggle Setup
// ===========================
function setupSidebarToggle() {
  // Toggle sidebar open/close
  sidebarToggle.addEventListener('click', () => {
    openSidebar();
  });

  // Close sidebar
  sidebarClose.addEventListener('click', () => {
    closeSidebar();
  });

  // Close sidebar when clicking overlay
  sidebarOverlay.addEventListener('click', () => {
    closeSidebar();
  });

  // Close sidebar on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSidebarOpen()) {
      closeSidebar();
    }
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024 && isSidebarOpen()) {
      closeSidebar();
    }
  });
}

// ===========================
// 📱 Sidebar Control Functions
// ===========================
function openSidebar() {
  videoListSidebar.classList.remove('hidden');
  videoListSidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
  
  // Prevent body scroll when sidebar is open
  document.body.style.overflow = 'hidden';
  
  // Update toggle button icon
  const icon = sidebarToggle.querySelector('img');
  if (icon) {
    icon.src = 'fonts/icons/System/close-line.svg';
  }
}

function closeSidebar() {
  videoListSidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
  
  // Restore body scroll
  document.body.style.overflow = '';
  
  // Update toggle button icon
  const icon = sidebarToggle.querySelector('img');
  if (icon) {
    icon.src = 'fonts/icons/System/menu-line.svg';
  }
  
  // Hide sidebar on mobile after animation
  setTimeout(() => {
    if (window.innerWidth < 1024) {
      videoListSidebar.classList.add('hidden');
    }
  }, 300);
}

function isSidebarOpen() {
  return videoListSidebar.classList.contains('open');
}

// ===========================
// 📱 Auto-close sidebar on video select
// ===========================
function closeSidebarOnVideoSelect() {
  if (window.innerWidth < 1024 && isSidebarOpen()) {
    closeSidebar();
  }
}

// ===========================
// 📥 Lấy danh sách video (Enhanced)
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

    // Check network status before fetching
    if (!isOnline) {
      throw new Error('No network connection');
    }

    showLoading();
    const res = await fetch(sheetUrl);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    
    if (!text.trim()) {
      throw new Error('Empty response from server');
    }

    const lines = text.trim().split("\n");

    if (lines.length < 2) {
      throw new Error('Invalid CSV format: insufficient data');
    }

    videoList = lines
      .slice(1)
      .map((line, index) => {
        const [id, url] = line.split(",");
        if (!id || !url) {
          return null;
        }
        return {
          id: id.trim(),
          url: url.trim()
        };
      })
      .filter(Boolean); // Remove null entries

    if (videoList.length === 0) {
      throw new Error('No valid videos found in data');
    }

    localStorage.setItem("videos", JSON.stringify(videoList));
    localStorage.setItem("videosLastUpdated", Date.now().toString());
    renderVideoList();
    resumeLastVideo();
    hideLoading();
    
  } catch (e) {
    hideLoading();
    
    const saved = localStorage.getItem("videos");
    if (saved) {
      videoList = JSON.parse(saved);
      renderVideoList();
      resumeLastVideo();
      showUserError('Đang sử dụng dữ liệu đã lưu. Một số video có thể không cập nhật.');
    } else {
      showUserError('Không thể tải danh sách video. Vui lòng kiểm tra kết nối mạng và thử lại.');
    }
  }
}

// ===========================
// 🔄 Fetch with Retry
// ===========================
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      
      if (i === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ===========================
// ▶️ Load video (Enhanced Error Handling)
// ===========================
function loadVideo(index, resumeTime = 0, direction = "up") {
  if (!videoList.length || isLoading) return;

  clearInterval(timeSaveInterval);
  clearTimeout(retryTimeout);
  isLoading = true;
  hasPlayed = false;
  currentIndex = (index + videoList.length) % videoList.length;

  localStorage.setItem(LAST_VIDEO_KEY, currentIndex);
  highlightCurrentVideo();

  const video = videoList[currentIndex];
  const url = video.url;
  
  // Check if this video has failed before
  if (failedVideos.has(url)) {
    loadVideo(currentIndex + 1, 0, direction);
    return;
  }

  seekBar.disabled = true;

  // 🧹 Cleanup
  if (hls) {
    hls.destroy();
    hls = null;
  }
  player.pause();
  player.removeAttribute("src");
  player.preload = "metadata";
  player.load();
  player.classList.remove("showing");

  videoTitle.textContent = `Video #${video.id}`;
  hideError();
  showLoading();

  // Reset retry count for new video
  retryCount = 0;

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

  player.classList.add(`video-slide-${direction}-exit`);
  requestAnimationFrame(() => {
    player.classList.add(`video-slide-${direction}-exit-active`);
  });

  setTimeout(() => {
    player.classList.remove(
      `video-slide-${direction}-exit`,
      `video-slide-${direction}-exit-active`
    );
    player.classList.add(`video-slide-${direction}-enter`);
    requestAnimationFrame(() => {
      player.classList.add(`video-slide-${direction}-enter-active`);
    });

    setTimeout(() => {
      player.muted = userMuted;
      updateMuteIcon();

      // ===========================
      // 🎬 Load video with broader format support
      // ===========================

      if (url.endsWith(".m3u8")) {
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(player);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            safePlay(resumeTime);
          });
          hls.on(Hls.Events.ERROR, () => {
            showLoadError();
          });
        } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
          player.src = url;
          safePlay(resumeTime);
        } else {
          showLoadError();
        }
      } else {
        // Non-HLS: check MIME and canPlayType before assigning
        const mime = getMimeTypeFromUrl(url);
        if (mime && player.canPlayType(mime)) {
          // Use <source> to hint type
          try {
            player.removeAttribute("src");
            while (player.firstChild) player.removeChild(player.firstChild);
            const source = document.createElement("source");
            source.src = url;
            source.type = mime;
            player.appendChild(source);
            player.load();
            safePlay(resumeTime);
          } catch (_) {
            player.src = url;
            safePlay(resumeTime);
          }
        } else {
          // If browser can't play this container, skip to next
          showLoadError();
        }
      }

      player.onerror = (e) => {
        showLoadError();
      };

      player.onplaying = () => {
        hasPlayed = true;
        clearTimeout(loadTimeout);
        hideLoading();
        seekBar.disabled = false;
        isLoading = false;
        player.classList.add("showing");

        // Save playback time
        timeSaveInterval = setInterval(() => {
          if (!player.paused && player.currentTime > 0) {
            localStorage.setItem(LAST_TIME_KEY, player.currentTime);
          }
        }, 1000);
      };

      player.onended = () => {
        loadVideo(currentIndex + 1, 0, "up");
      };

      // Set timeout
      loadTimeout = setTimeout(() => {
        if (!hasPlayed) {
          showLoadError();
        }
      }, 20000);
    }, 150);
  }, 150);
}

// ===========================
// 🎬 Load Video with Retry Mechanism
// ===========================
async function loadVideoWithRetry(url, resumeTime = 0) {
  try {
    
    // Temporarily disable validation to debug
    // const isValid = await validateVideoUrl(url);
    // if (!isValid) {
    //   throw new Error('Invalid video URL');
    // }

    if (url.endsWith(".m3u8")) {
      await loadHLSVideo(url, resumeTime);
    } else {
      await loadRegularVideo(url, resumeTime);
    }

    // Set up event listeners
    setupVideoEventListeners(resumeTime);

  } catch (error) {
    handleVideoLoadError(url, error);
  }
}

// ===========================
// 🔍 Validate Video URL
// ===========================
async function validateVideoUrl(url) {
  // Check cache first
  if (videoValidationCache.has(url)) {
    return videoValidationCache.get(url);
  }

  try {
    // Quick HEAD request to check if URL is accessible
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const isValid = response.ok;
    videoValidationCache.set(url, isValid);
    return isValid;
  } catch (error) {
    videoValidationCache.set(url, false);
    return false;
  }
}

// ===========================
// 🎞️ Load HLS Video
// ===========================
async function loadHLSVideo(url, resumeTime) {
  return new Promise((resolve, reject) => {
    
    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: false, // Disable worker for debugging
        lowLatencyMode: false,
        backBufferLength: 30
      });
      
      hls.loadSource(url);
      hls.attachMedia(player);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        resolve();
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          reject(new Error(`HLS Error: ${data.type} - ${data.details}`));
        }
      });
      
    } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
      player.src = url;
      player.addEventListener('loadedmetadata', () => {
        resolve();
      }, { once: true });
      player.addEventListener('error', (e) => {
        reject(new Error('Native HLS error'));
      }, { once: true });
    } else {
      reject(new Error('HLS not supported'));
    }
  });
}

// ===========================
// 🎥 Load Regular Video
// ===========================
async function loadRegularVideo(url, resumeTime) {
  return new Promise((resolve, reject) => {
    player.src = url;
    
    const onLoadedMetadata = () => {
      player.removeEventListener('loadedmetadata', onLoadedMetadata);
      player.removeEventListener('error', onError);
      resolve();
    };
    
    const onError = (e) => {
      player.removeEventListener('loadedmetadata', onLoadedMetadata);
      player.removeEventListener('error', onError);
      reject(new Error(`Video load error: ${e.target.error?.message || 'Unknown error'}`));
    };
    
    player.addEventListener('loadedmetadata', onLoadedMetadata);
    player.addEventListener('error', onError);
  });
}

// ===========================
// 🎧 Setup Video Event Listeners
// ===========================
function setupVideoEventListeners(resumeTime) {
  // Clear existing listeners
  player.onerror = null;
  player.onplaying = null;
  player.onended = null;

  player.onerror = (e) => {
    handleVideoLoadError(videoList[currentIndex].url, new Error('Player error'));
  };

  player.onplaying = () => {
    hasPlayed = true;
    clearTimeout(loadTimeout);
    hideLoading();
    seekBar.disabled = false;
    isLoading = false;
    player.classList.add("showing");
    retryCount = 0; // Reset retry count on successful play

    // Save playback time
    timeSaveInterval = setInterval(() => {
      if (!player.paused && player.currentTime > 0) {
        localStorage.setItem(LAST_TIME_KEY, player.currentTime);
      }
    }, 1000);

    // Preload next video
    preloadNextVideo();
  };

  player.onended = () => {
    loadVideo(currentIndex + 1, 0, "up");
  };

  // Set timeout based on network quality
  const timeoutDuration = networkQuality === 'poor' ? 30000 : 20000;
  loadTimeout = setTimeout(() => {
    if (!hasPlayed) {
      handleVideoLoadError(videoList[currentIndex].url, new Error('Load timeout'));
    }
  }, timeoutDuration);

  // Start playback
  safePlay(resumeTime);
}

// ===========================
// 🔮 Preload Next Video
// ===========================
function preloadNextVideo() {
  if (videoList.length <= 1) return;
  if (networkQuality !== 'good') return;
  
  const nextIndex = (currentIndex + 1) % videoList.length;
  const nextVideo = videoList[nextIndex];
  
  if (failedVideos.has(nextVideo.url)) return;
  
  const preloadVideo = document.createElement("video");
  preloadVideo.preload = "metadata";
  preloadVideo.src = nextVideo.url;
  preloadVideo.muted = true;
  preloadVideo.load();
  
  preloadVideo.addEventListener('error', () => {
  });
}

// ===========================
// 🛠️ Handle Video Load Error
// ===========================
function handleVideoLoadError(url, error) {
  
  retryCount++;
  
  if (retryCount < MAX_RETRIES) {
    showUserError(`Đang thử lại... (${retryCount}/${MAX_RETRIES})`);
    
    // Exponential backoff
    const delay = Math.pow(2, retryCount - 1) * 1000;
    retryTimeout = setTimeout(() => {
      loadVideoWithRetry(url, 0);
    }, delay);
  } else {
    failedVideos.add(url);
    showLoadError();
  }
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
    li.className = "flex items-center justify-between px-2 py-2 hover:bg-gray-800/30 transition";

    const thumb = document.createElement("div");
    thumb.className = "w-16 h-9 rounded bg-gradient-to-r from-primary to-secondary flex items-center justify-center text-xs font-bold";
    thumb.textContent = `#${video.id}`;

    const info = document.createElement("div");
    info.className = "flex-1 ml-2 text-sm truncate";
    const watched = watchedVideos[video.id];
    info.textContent = watched ? `Đã xem: ${watched}` : `Chưa xem`;

    li.appendChild(thumb);
    li.appendChild(info);
    li.addEventListener("click", () => {
      loadVideo(index);
      // Auto-scroll will be handled by highlightCurrentVideo()
      // Auto-close sidebar on mobile
      closeSidebarOnVideoSelect();
    });

    videoListContainer.appendChild(li);
  });

  highlightCurrentVideo();
}

// ===========================
// ✨ Highlight video with auto-scroll
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
  ).toString().padStart(2, "0")}-${now.getFullYear()} ${now
    .getHours()
    .toString()
    .padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${now
    .getSeconds()
    .toString()
    .padStart(2, "0")}`;
  watchedVideos[currentVideo.id] = formattedTime;
  localStorage.setItem("watchedVideos", JSON.stringify(watchedVideos));

  const infoEl = allItems[currentIndex].querySelector(".flex-1");
  if (infoEl) infoEl.textContent = `Đã xem: ${formattedTime}`;

  // ===========================
  // 📜 Auto-scroll to current video
  // ===========================
  scrollToCurrentVideo();
}

// ===========================
// 📜 Scroll to Current Video (Enhanced)
// ===========================
function scrollToCurrentVideo() {
  const allItems = videoListContainer.querySelectorAll("li");
  const currentItem = allItems[currentIndex];
  
  if (!currentItem) return;

  const container = videoListContainer;
  const containerRect = container.getBoundingClientRect();
  const itemRect = currentItem.getBoundingClientRect();
  
  // Calculate if item is visible with some padding
  const padding = 50; // pixels
  const isVisible = itemRect.top >= (containerRect.top + padding) && 
                   itemRect.bottom <= (containerRect.bottom - padding);
  
  if (!isVisible) {
    // Calculate scroll position to center the item
    const itemOffsetTop = currentItem.offsetTop;
    const containerHeight = container.clientHeight;
    const itemHeight = currentItem.offsetHeight;
    
    // For large lists, scroll to show more context
    const totalItems = allItems.length;
    let scrollTop;
    
    if (totalItems > 100) {
      // For large lists, show current item in upper third
      scrollTop = itemOffsetTop - (containerHeight / 3);
    } else {
      // For smaller lists, center the item
      scrollTop = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);
    }
    
    // Smooth scroll to position with debouncing
    clearTimeout(scrollToCurrentVideo.timeoutId);
    scrollToCurrentVideo.timeoutId = setTimeout(() => {
      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: 'smooth'
      });
      
    }, 100); // Small delay to prevent excessive scrolling
  }
}

// ===========================
// 🎯 Scroll to Video by Index
// ===========================
function scrollToVideoIndex(index) {
  if (index < 0 || index >= videoList.length) return;
  
  const allItems = videoListContainer.querySelectorAll("li");
  const targetItem = allItems[index];
  
  if (!targetItem) return;

  const container = videoListContainer;
  const itemOffsetTop = targetItem.offsetTop;
  const containerHeight = container.clientHeight;
  const itemHeight = targetItem.offsetHeight;
  
  // Center the item in the container
  const scrollTop = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);
  
  container.scrollTo({
    top: Math.max(0, scrollTop),
    behavior: 'smooth'
  });
  
}

// ===========================
// ⏳ Enhanced Error & Loading Handling
// ===========================
function showLoadError() {
  clearTimeout(loadTimeout);
  clearTimeout(retryTimeout);
  hideLoading();
  errorOverlay.classList.remove("hidden");
  
  // Update error message
  const errorMsg = document.querySelector('#errorOverlay span');
  if (errorMsg) {
    errorMsg.textContent = 'Không thể tải video. Đang chuyển video tiếp theo...';
  }
  
  setTimeout(() => {
    hideError();
    isLoading = false;
    loadVideo(currentIndex + 1);
  }, 2000);
}

function showUserError(message) {
  hideLoading();
  errorOverlay.classList.remove("hidden");
  
  const errorMsg = document.querySelector('#errorOverlay span');
  if (errorMsg) {
    errorMsg.textContent = message;
  }
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

// ===========================
// 🧰 MIME helpers
// ===========================
function getMimeTypeFromUrl(url) {
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  if (cleanUrl.endsWith('.mp4')) return 'video/mp4';
  if (cleanUrl.endsWith('.webm')) return 'video/webm';
  if (cleanUrl.endsWith('.ogv') || cleanUrl.endsWith('.ogg')) return 'video/ogg';
  // Matroska (MKV) thường không được hỗ trợ native; để trình duyệt tự quyết định
  if (cleanUrl.endsWith('.mkv')) return 'video/x-matroska';
  return '';
}

// ===========================
// 🔄 Retry Load Video
// ===========================
function retryLoadVideo() {
  if (retryCount < MAX_RETRIES && !isLoading) {
    loadVideo(currentIndex, 0);
  }
}

// ===========================
// ▶️ Safe Play
// ===========================
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
    `<img src="fonts/icons/Media/volume-mute-line.svg" class="w-6 h-6 invert" />` :
    `<img src="fonts/icons/Media/volume-up-line.svg" class="w-6 h-6 invert" />`;
}

// ===========================
// 🖱️ Click video để Play/Pause
// ===========================
document.querySelector(".video-container").addEventListener("click", (e) => {
  if (e.target === muteBtn) return;
  player.paused ? player.play() : player.pause();
});

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
    showLoading();
    player.currentTime = (seekBar.value / 100) * player.duration;
    player.play();
  }
});
speedSelect.addEventListener("change", () => {
  player.playbackRate = parseFloat(speedSelect.value);
});
player.addEventListener("playing", () => hideLoading());

// ===========================
// ⏩⏪ Seek helpers & events
// ===========================
function seekBy(seconds) {
  if (!player || !isFinite(player.duration) || player.duration <= 0) return;
  const target = Math.min(Math.max((player.currentTime || 0) + seconds, 0), player.duration);
  player.currentTime = target;
  // Cập nhật seekBar ngay lập tức cho cảm giác phản hồi tốt
  if (player.duration && isFinite(player.duration)) {
    seekBar.value = (target / player.duration) * 100;
  }
  // Tiếp tục phát sau khi tua
  if (player.paused && !player.ended) {
    const p = player.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }
}

function bindSeekButton(el, seconds) {
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    seekBy(seconds);
  });
}

bindSeekButton(seekBack10, -10);
bindSeekButton(seekFwd10, 10);
bindSeekButton(seekBack30, -30);
bindSeekButton(seekFwd30, 30);
bindSeekButton(seekBack60, -60);
bindSeekButton(seekFwd60, 60);

// Khi pause -> hiện overlay
player.addEventListener("pause", () => {
  if (!player.ended) pausedOverlay.classList.add("show");
});
player.addEventListener("play", () => {
  pausedOverlay.classList.remove("show");
});
pausedOverlay.addEventListener("click", () => {
  const p = player.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
});

// ===========================
// ⬆⬇ Scroll chuyển video
// ===========================
document.querySelector(".video-container").addEventListener("wheel", (e) => {
  const now = Date.now();
  if (isLoading || now - lastScrollTime < SCROLL_COOLDOWN) return;
  lastScrollTime = now;
  e.deltaY > 0 ? loadVideo(currentIndex + 1, 0, "up") : loadVideo(currentIndex - 1, 0, "down");
});

// ===========================
// 📱 Vuốt chuyển video mobile
// ===========================
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
// ⏭ Enhanced Buttons
// ===========================
prevBtn.addEventListener("click", () => {
  if (!isLoading) {
    const newIndex = currentIndex - 1;
    loadVideo(newIndex, 0, "down");
    // Auto-scroll will be handled by highlightCurrentVideo()
  }
});

nextBtn.addEventListener("click", () => {
  if (!isLoading) {
    const newIndex = currentIndex + 1;
    loadVideo(newIndex, 0, "up");
    // Auto-scroll will be handled by highlightCurrentVideo()
  }
});

reloadBtn.addEventListener("click", () => {
  // Clear caches and retry
  videoValidationCache.clear();
  failedVideos.clear();
  retryCount = 0;
  clearTimeout(retryTimeout);
  
  showUserError('Đang tải lại danh sách video...');
  loadVideoList(true);
});

// ===========================
// 🧹 Cleanup on page unload
// ===========================
window.addEventListener('beforeunload', () => {
  if (hls) {
    hls.destroy();
  }
  clearInterval(timeSaveInterval);
  clearTimeout(loadTimeout);
  clearTimeout(retryTimeout);
});