(() => {
  'use strict';

  const key = '__nativeVideoV22';
  if (window[key]) {
    window[key].show();
    return;
  }
  if (!document.body) {
    alert('Wait for the page to finish loading.');
    return;
  }
  if (window.__hlsFinder) {
    alert('Reload once to remove the old HLS finder, then run this bookmark.');
    return;
  }

  window.__airplaySourcesV21?.close?.();
  window.__airplaySourcesV2?.close?.();

  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  let stopped = false, observer, candidate = null, active = null;
  let video = null, overlay = null, original = null, originalSrc = '';
  let wasPlaying = false, position = 0, acceptAfter = -Infinity;
  let menuOpen = false, message = '', measuredWidth = 0, measuredHeight = 0;
  let sitePage = location.href;

  function node(tag, text) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    return element;
  }

  const host = node('div');
  host.id = 'native-video-v22';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;color-scheme:dark';
  const root = host.attachShadow({ mode: 'open' });
  const style = node('style');
  style.textContent = `:host{font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;color-scheme:dark}*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation;min-height:44px}button:focus-visible{outline:2px solid #fff;outline-offset:2px}#chip{pointer-events:auto;position:fixed;top:calc(max(10px,env(safe-area-inset-top)) + 64px);left:50%;transform:translateX(-50%);padding:8px 13px;border:1px solid #555;border-radius:24px;background:rgba(22,22,24,.94);font-weight:600}#menu{pointer-events:auto;position:fixed;top:calc(max(10px,env(safe-area-inset-top)) + 118px);left:50%;transform:translateX(-50%);width:min(280px,calc(100vw - 24px));max-height:65vh;max-height:min(65vh,calc(100dvh - max(10px,env(safe-area-inset-top)) - 132px - env(safe-area-inset-bottom)));overflow:auto;padding:12px;background:#19191b;border:1px solid #444;border-radius:12px}#heading{display:flex;align-items:center;justify-content:space-between;font-weight:600}#hide{background:transparent;border:0;padding:4px 6px;color:#ccc;font-size:13px}p{font-size:13px;color:#bcbcc2;margin:8px 0;overflow-wrap:anywhere}#actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.action{border:0;border-radius:8px;background:#303034;padding:8px 11px}#remove{background:transparent;color:#bcbcc2}`;

  const chip = node('button', 'Waiting...');
  chip.id = 'chip';
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'dialog');
  const menu = node('section');
  menu.id = 'menu';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Native video');
  const heading = node('div', 'Native video');
  heading.id = 'heading';
  const hide = node('button', 'Close');
  hide.id = 'hide';
  hide.type = 'button';
  heading.append(hide);
  const details = node('p');
  const actions = node('div');
  actions.id = 'actions';

  function button(label, id) {
    const b = node('button', label);
    b.id = id;
    b.type = 'button';
    b.className = 'action';
    actions.append(b);
    return b;
  }

  const playButton = button('Play native', 'play');
  const back = button('Back to site', 'back');
  const remove = button('Remove', 'remove');
  menu.append(heading, details, actions);
  root.append(style, chip, menu);
  document.documentElement.append(host);

  function show(open = true) {
    menuOpen = open;
    menu.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
    render();
  }

  function render() {
    if (stopped) return;
    const wireless = !!video?.webkitCurrentPlaybackTargetIsWireless;
    const size = measuredWidth && measuredHeight ? measuredWidth + 'x' + measuredHeight : '';
    const badge = measuredWidth === 3840 && measuredHeight === 2160 ? '4K' : measuredHeight + 'p';
    chip.textContent = video
      ? (video.error ? 'Video error' : wireless ? 'AirPlay' : size ? badge : 'Native video')
      : candidate ? 'Play native' : 'Waiting...';
    if (!menuOpen) return;
    details.textContent = message || (video
      ? (wireless ? 'AirPlay active. Last local size: ' : 'Local size: ') + (size || 'not measured') + '. TV resolution is not measured.'
      : candidate
        ? 'Choose source and quality in the site first, then play the detected stream here.'
        : 'Choose source and quality in the site, then start or restart playback. Waiting for a playlist request.');
    playButton.hidden = video ? !video.error : !candidate;
    playButton.textContent = video?.error ? 'Retry' : 'Play native';
    back.hidden = !video;
  }

  function record(value, time = performance.now()) {
    if (stopped || video || time < acceptAfter) return;
    try {
      const raw = typeof value === 'string' ? value : value instanceof URL ? value.href : value?.url;
      if (!raw || !/\.m3u8(?:[?#]|$)/i.test(raw)) return;
      const url = new URL(raw, document.baseURI);
      if (!/^https?:$/.test(url.protocol)) return;
      if (candidate && time < candidate[1]) return;
      candidate = [url.href, time];
      sitePage = location.href;
      message = '';
      render();
    } catch (_) {}
  }

  function wrappedFetch(...args) {
    const result = originalFetch.apply(this, args);
    record(args[0]);
    return result;
  }

  function wrappedOpen(...args) {
    const result = originalOpen.apply(this, args);
    record(args[1]);
    return result;
  }

  try {
    if (typeof originalFetch === 'function') window.fetch = wrappedFetch;
  } catch (_) {}
  try {
    XMLHttpRequest.prototype.open = wrappedOpen;
  } catch (_) {}
  try {
    observer = new PerformanceObserver(list => list.getEntries().forEach(e => record(e.name, e.startTime)));
    try {
      observer.observe({ type: 'resource', buffered: true });
    } catch (_) {
      observer.observe({ entryTypes: ['resource'] });
    }
  } catch (_) {}
  try {
    performance.getEntriesByType('resource').forEach(e => record(e.name, e.startTime));
  } catch (_) {}

  function siteVideo() {
    const videos = [...document.querySelectorAll('video')].filter(v => !v.dataset.airplayNative);
    return videos.find(v => !v.paused && !v.ended) || videos[0] || null;
  }

  function directSource() {
    const v = siteVideo();
    if (v?.currentSrc) record(v.currentSrc);
    else if (v?.src) record(v.src);
  }
  directSource();

  function play(v) {
    try {
      v?.play()?.catch(error => {
        if (video === v && error.name === 'NotAllowedError') {
          message = 'Tap Play on the native video.';
          render();
        }
      });
    } catch (_) {}
  }

  function seek(v, time) {
    try {
      if (Number.isFinite(time) && time >= 0) {
        v.currentTime = Number.isFinite(v.duration) && v.duration > 0
          ? Math.min(time, Math.max(0, v.duration - 0.1)) : time;
      }
    } catch (_) {}
  }

  function remember() {
    if (video?.readyState && Number.isFinite(video.currentTime)) position = video.currentTime;
  }

  function discard() {
    const old = video;
    video = null;
    if (old) {
      old.pause();
      old.removeAttribute('src');
      old.load();
    }
    overlay?.remove();
    overlay = null;
  }

  function suppressSitePause(event) {
    event.stopImmediatePropagation();
  }

  function closeVideo() {
    if (!video) return;
    remember();
    original?.removeEventListener('pause', suppressSitePause, true);
    discard();
    acceptAfter = performance.now();
    active = null;
    message = '';
    measuredWidth = measuredHeight = 0;
    if (original?.isConnected && location.href === sitePage && original.currentSrc === originalSrc) {
      seek(original, position);
      if (wasPlaying) play(original);
    }
    original = null;
    render();
  }

  function openVideo() {
    if (!video) {
      if (location.href !== sitePage) {
        candidate = null;
        sitePage = location.href;
        message = 'This page changed. Restart playback to detect its stream.';
      }
      directSource();
    }
    const source = video && active ? active : candidate;
    if (!source) {
      show();
      return;
    }
    if (video && !video.error) {
      play(video);
      show(false);
      return;
    }
    if (video) remember();
    else {
      original = siteVideo();
      originalSrc = original?.currentSrc || '';
      wasPlaying = !!original && !original.paused && !original.ended;
      position = Number.isFinite(original?.currentTime) ? original.currentTime : 0;
    }
    discard();
    original?.addEventListener('pause', suppressSitePause, true);
    original?.pause();
    active = source;
    message = '';
    measuredWidth = measuredHeight = 0;
    overlay = node('div');
    overlay.dataset.airplayOverlay = 'true';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#000';
    const v = node('video');
    video = v;
    v.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;background:#000';
    v.crossOrigin = 'anonymous';
    v.controls = true;
    v.playsInline = true;
    v.disableRemotePlayback = false;
    v.setAttribute('x-webkit-airplay', 'allow');
    v.dataset.airplayNative = 'true';
    overlay.append(v);
    document.documentElement.append(overlay);

    function measure() {
      if (video !== v || !v.readyState || v.error) return;
      if (!v.webkitCurrentPlaybackTargetIsWireless && v.videoWidth && v.videoHeight) {
        measuredWidth = v.videoWidth;
        measuredHeight = v.videoHeight;
      }
      render();
    }

    v.addEventListener('loadedmetadata', () => {
      if (video === v) {
        seek(v, position);
        measure();
      }
    }, { once: true });
    ['loadeddata', 'resize', 'webkitcurrentplaybacktargetiswirelesschanged']
      .forEach(e => v.addEventListener(e, measure));
    v.addEventListener('playing', () => {
      if (video === v) {
        message = '';
        measure();
      }
    });
    v.addEventListener('error', () => {
      if (video !== v) return;
      message = 'Native playback failed (error ' + (v.error?.code || '?') + '). Retry or go back to the site.';
      show();
    });
    show(false);
    v.src = source[0];
    v.load();
    play(v);
  }

  chip.onclick = () => {
    if (!video && candidate && !menuOpen) openVideo();
    else show(!menuOpen);
  };
  playButton.onclick = openVideo;
  back.onclick = () => {
    closeVideo();
    show(false);
  };
  hide.onclick = () => show(false);

  function outside(event) {
    if (menuOpen && !event.composedPath().includes(host)) show(false);
  }
  function keydown(event) {
    if (event.key === 'Escape' && menuOpen) show(false);
  }
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', keydown);

  const state = {
    show() { show(); },
    close() {
      stopped = true;
      observer?.disconnect();
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      if (XMLHttpRequest.prototype.open === wrappedOpen) XMLHttpRequest.prototype.open = originalOpen;
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keydown);
      closeVideo();
      host.remove();
      if (window[key] === state) delete window[key];
    }
  };
  remove.onclick = state.close;
  window[key] = state;
  render();
})();
