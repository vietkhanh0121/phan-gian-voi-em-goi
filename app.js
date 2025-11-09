const swStatus = document.getElementById('swStatus');
const btnPing = document.getElementById('btnPing');
const btnInstall = document.getElementById('btnInstall');

const SW_URL = './sw.js';

if ('serviceWorker' in navigator) {
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: './' });
    swStatus.textContent = 'Service Worker: đã đăng ký (' + (reg.scope || './') + ')';
  } catch (e) {
    swStatus.textContent = 'Service Worker: lỗi đăng ký – ' + e.message;
  }
} else {
  swStatus.textContent = 'Trình duyệt không hỗ trợ Service Worker.';
}

btnPing?.addEventListener('click', async () => {
  try {
    const res = await fetch('./offline-ping.json', { cache: 'no-store' });
    const data = await res.json();
    alert('OK! Cache hoạt động. time=' + data.time);
  } catch (e) {
    alert('Không tải được (có thể offline & chưa cache). ' + e.message);
  }
});

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
