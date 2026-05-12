// ==========================================
// PICAM v4.0 - utils.js
// Utilities comuni: formatters, toast, beep, vibrate, debounce
// ==========================================

APP.formatDate = function(date) {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

APP.formatDatePicam = function(date) {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`;
};

APP.formatDateFile = function(date) {
    const d = new Date(date);
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
};

APP.formatDecimal = function(value) {
    return parseFloat(value || 0).toFixed(6).replace('.', ',');
};

APP.formatCurrency = function(value) {
    return '€ ' + parseFloat(value || 0).toFixed(2).replace('.', ',');
};

APP.formatNumber = function(num) {
    return num.toLocaleString('it-IT');
};

APP.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
};

APP.playBeep = function() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; osc.type = 'sine'; gain.gain.value = 0.3;
        osc.start(); setTimeout(() => osc.stop(), 100);
    } catch(e) {}
};

APP.vibrate = function(duration = 50) {
    if (navigator.vibrate) navigator.vibrate(duration);
};

APP.debounceSearch = function(context) {
    if (APP.searchTimers[context]) clearTimeout(APP.searchTimers[context]);
    APP.searchTimers[context] = setTimeout(() => APP.performSearch(context), 300);
};
