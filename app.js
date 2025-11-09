// App logic + Service Worker register + install prompt
const swStatus = document.getElementById('swStatus');
const btnPing = document.getElementById('btnPing');
const btnInstall = document.getElementById('btnInstall');

// --- Service Worker registration ---
if ('serviceWorker' in navigator) {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swStatus.textContent = 'Service Worker: đã đăng ký (' + (reg.scope || '/') + ')';
  } catch (e) {
    swStatus.textContent = 'Service Worker: lỗi đăng ký – ' + e.message;
  }
} else {
  swStatus.textContent = 'Trình duyệt không hỗ trợ Service Worker.';
}

// --- Test an offline fetch (ping a small JSON created at build time) ---
btnPing?.addEventListener('click', async () => {
  try {
    const res = await fetch('/offline-ping.json', { cache: 'no-store' });
    const data = await res.json();
    alert('OK! Cache hoạt động. time=' + data.time);
  } catch (e) {
    alert('Không tải được (có thể đang offline & chưa có cache). ' + e.message);
  }
});

// --- Basic install prompt for Android/Chromium ---
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.hidden = false;
});
btnInstall?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log('Install outcome:', outcome);
  btnInstall.hidden = true;
  deferredPrompt = null;
});
