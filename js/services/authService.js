/**
 * Auth Service
 * Login Google untuk mode edit. Tanpa login, situs hanya bisa dilihat.
 *
 * Yang benar-benar mengunci data adalah Firestore Rules (lihat firestore.rules).
 * File ini cuma menampilkan atau menyembunyikan tombol edit lewat class
 * `can-edit` di <body>.
 */
import { checkEditorAccess } from '../repositories/storageRepository.js';
import { closeModal } from '../modules/modals.js';
import { showToast } from '../utils/toast.js';

const LOGIN_ERRORS = {
  'auth/popup-blocked': 'Popup login diblokir browser. Izinkan popup untuk situs ini, lalu coba lagi.',
  'auth/unauthorized-domain': 'Domain ini belum didaftarkan di Firebase Authentication.',
  'auth/operation-not-allowed': 'Login Google belum diaktifkan di Firebase Authentication.',
  'auth/configuration-not-found': 'Firebase Authentication belum diaktifkan untuk project ini.'
};

export function setupAuth() {
  if (!window.firebase || typeof firebase.auth !== 'function') return;

  const auth = firebase.auth();
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const accountEmail = document.getElementById('settings-account-email');
  let justClickedLogin = false;

  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      justClickedLogin = true;
      try {
        await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      } catch (err) {
        justClickedLogin = false;
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
        console.error('Login gagal:', err);
        showToast(LOGIN_ERRORS[err.code] || 'Gagal masuk. Coba lagi sebentar lagi.');
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      closeModal(document.getElementById('modal-settings'));
      await auth.signOut();
      showToast('Kamu sudah keluar.');
    });
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      document.body.classList.remove('can-edit');
      return;
    }

    const access = await checkEditorAccess();
    if (access === 'granted') {
      if (accountEmail) accountEmail.textContent = user.email;
      document.body.classList.add('can-edit');
      if (justClickedLogin) showToast(`Masuk sebagai ${user.email}`);
    } else if (access === 'denied') {
      showToast(`Akun ${user.email} tidak punya akses untuk mengedit.`);
      await auth.signOut();
    } else {
      showToast('Belum bisa memeriksa akses edit. Cek koneksi, lalu muat ulang halaman.');
    }
    justClickedLogin = false;
  });
}
