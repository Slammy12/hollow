const API_BASE = window.HOLLOW_API_BASE || 'https://hollow-production-df55.up.railway.app/api';
const TOKEN_KEY = 'hollow_token';
const DEPOSIT_ADDRESS = 'Fa4hDTD1tXNrDcrzWNJgSiexuMub3ptwR66cYxpT7YZt';

const loginView = document.getElementById('login-view');
const dashView = document.getElementById('dashboard-view');
const dashboardContent = document.getElementById('dashboard-content');
const withdrawView = document.getElementById('withdraw-view');
const form = document.getElementById('login-form');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const logoutBtn = document.getElementById('logout-btn');
const codeInput = document.getElementById('login-code');

let currentSolPrice = 73.95;
let fundSolBalance = 0;

function goToDashboard(animate) {
  if (animate) {
    loginView.classList.add('login-exit');
    setTimeout(function () {
      loginView.style.display = 'none';
      dashView.style.display = 'block';
      requestAnimationFrame(function () {
        dashView.classList.add('visible');
      });
    }, 420);
  } else {
    loginView.style.display = 'none';
    dashView.style.display = 'block';
    dashView.classList.add('visible');
  }
  showDashboardPage();
}

function goToLogin() {
  dashView.classList.remove('visible');
  dashView.style.display = 'none';
  loginView.classList.remove('login-exit');
  loginView.style.display = 'grid';
  localStorage.removeItem(TOKEN_KEY);
  form.reset();
  errorMsg.style.display = 'none';
  showDashboardPage();
}

function showDashboardPage() {
  dashboardContent.style.display = 'block';
  withdrawView.style.display = 'none';
}

function showWithdrawPage() {
  dashboardContent.style.display = 'none';
  withdrawView.style.display = 'block';
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  errorMsg.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  fetch(API_BASE + '/auth/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: codeInput.value.trim() })
  })
    .then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    })
    .then(function (result) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
      if (!result.ok) {
        errorMsg.textContent = result.data.error || result.data.message || 'That code is not valid or has expired.';
        errorMsg.style.display = 'block';
        return;
      }
      localStorage.setItem(TOKEN_KEY, result.data.token);
      goToDashboard(true);
    })
    .catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
      errorMsg.textContent = 'Could not reach the server. Try again.';
      errorMsg.style.display = 'block';
    });
});

logoutBtn.addEventListener('click', goToLogin);

if (localStorage.getItem(TOKEN_KEY)) {
  goToDashboard(false);
}

document.getElementById('copy-addr').addEventListener('click', function () {
  const btn = this;
  navigator.clipboard.writeText(DEPOSIT_ADDRESS).then(function () {
    btn.textContent = 'copied';
    setTimeout(function () { btn.textContent = 'copy'; }, 1200);
  });
});

function updateFundWalletDisplay() {
  const line = document.getElementById('fund-sol-line');
  const usdEl = document.getElementById('fund-usd');
  if (line) {
    line.textContent = fundSolBalance.toFixed(4) + ' SOL · 1 SOL = $' + currentSolPrice.toFixed(2);
  }
  if (usdEl) {
    usdEl.textContent = '$' + (fundSolBalance * currentSolPrice).toFixed(2);
  }
}

function updateSolPrice(price) {
  currentSolPrice = price;
  updateFundWalletDisplay();
  updateBundleHints();
  const devHint = document.getElementById('dev-buy-hint');
  if (devHint) {
    const devBuy = parseFloat(document.getElementById('dev-buy').value) || 0;
    devHint.textContent = '≈ $' + (devBuy * currentSolPrice).toFixed(2) + ' at current price';
  }
}

function fetchSolPrice() {
  fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data && data.solana && data.solana.usd) {
        updateSolPrice(parseFloat(data.solana.usd));
      }
    })
    .catch(function () {
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.price) {
            updateSolPrice(parseFloat(data.price));
          }
        })
        .catch(function () {});
    });
}

fetchSolPrice();
setInterval(fetchSolPrice, 15000);
updateFundWalletDisplay();

document.getElementById('withdraw-btn').addEventListener('click', showWithdrawPage);
document.getElementById('withdraw-back').addEventListener('click', showDashboardPage);

document.getElementById('withdraw-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  const address = document.getElementById('withdraw-address').value.trim();
  const btn = document.getElementById('withdraw-submit');

  if (!amount || amount <= 0) {
    showToast('Enter a valid SOL amount');
    return;
  }
  if (!address) {
    showToast('Enter a destination address');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Processing…';
  setTimeout(function () {
    btn.disabled = false;
    btn.textContent = 'Withdraw';
    showToast('Withdrawal submitted · ' + amount.toFixed(4) + ' SOL');
    document.getElementById('withdraw-form').reset();
    showDashboardPage();
  }, 900);
});

// --- Coin modal ---
const coins = [];
const coinsGrid = document.getElementById('coins-grid');
const coinsEmpty = document.getElementById('coins-empty');
const coinsCountEl = document.getElementById('coins-count');
const activeCountEl = document.getElementById('active-coins-count');
const searchInput = document.getElementById('coin-search');
const filterSelect = document.getElementById('coin-filter');
const overlay = document.getElementById('modal-overlay');
const coinForm = document.getElementById('coin-form');
const imageInput = document.getElementById('coin-image');
const imageDrop = document.getElementById('image-drop');
let pendingImage = null;
let currentStep = 1;
const totalSteps = 3;
const nextBtn = document.getElementById('modal-next');
const backBtn = document.getElementById('modal-back');
const submitBtnFinal = document.getElementById('coin-submit-btn');
const trackerItems = document.querySelectorAll('.step-tracker-item');
const wizardSteps = document.querySelectorAll('.wizard-step');

function setStep(step) {
  currentStep = step;
  wizardSteps.forEach(function (el) {
    el.style.display = parseInt(el.dataset.step, 10) === step ? 'block' : 'none';
  });
  trackerItems.forEach(function (el) {
    const n = parseInt(el.dataset.step, 10);
    el.classList.remove('active', 'done');
    if (n === step) el.classList.add('active');
    else if (n < step) el.classList.add('done');
  });
  backBtn.style.display = step > 1 ? 'inline-block' : 'none';
  nextBtn.style.display = step < totalSteps ? 'inline-block' : 'none';
  submitBtnFinal.style.display = step === totalSteps ? 'inline-block' : 'none';
}

nextBtn.addEventListener('click', function () {
  if (currentStep === 1) {
    const name = document.getElementById('coin-name').value.trim();
    const ticker = document.getElementById('coin-ticker').value.trim();
    if (!name || !ticker) {
      document.getElementById('coin-name').focus();
      return;
    }
  }
  if (currentStep < totalSteps) setStep(currentStep + 1);
});

backBtn.addEventListener('click', function () {
  if (currentStep > 1) setStep(currentStep - 1);
});

function openModal() {
  overlay.classList.add('open');
  setStep(1);
}

function closeModal() {
  overlay.classList.remove('open');
  coinForm.reset();
  pendingImage = null;
  imageDrop.innerHTML = '<span id="image-drop-icon">◍</span>';
  setStep(1);
  document.querySelectorAll('.slip-chip').forEach(function (c) { c.classList.remove('active'); });
  document.querySelector('.slip-chip[data-val="2"]').classList.add('active');
  document.getElementById('slippage').value = 2;
  document.getElementById('bundle-wallets').value = 6;
  document.getElementById('wallet-count-badge').textContent = '6';
}

document.getElementById('create-coin-btn').addEventListener('click', openModal);
document.querySelectorAll('.create-first-btn').forEach(function (btn) {
  btn.addEventListener('click', openModal);
});
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
overlay.addEventListener('click', function (e) {
  if (e.target === overlay) closeModal();
});

document.querySelectorAll('.slip-chip').forEach(function (chip) {
  chip.addEventListener('click', function () {
    document.querySelectorAll('.slip-chip').forEach(function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    document.getElementById('slippage').value = chip.dataset.val;
  });
});

document.getElementById('slippage').addEventListener('input', function () {
  document.querySelectorAll('.slip-chip').forEach(function (c) { c.classList.remove('active'); });
  const match = document.querySelector('.slip-chip[data-val="' + this.value + '"]');
  if (match) match.classList.add('active');
});

document.getElementById('dev-buy').addEventListener('input', function () {
  const val = parseFloat(this.value) || 0;
  document.getElementById('dev-buy-hint').textContent = '≈ $' + (val * currentSolPrice).toFixed(2) + ' at current price';
});

const bundleWalletsInput = document.getElementById('bundle-wallets');
const walletBadge = document.getElementById('wallet-count-badge');

function updateBundleHints() {
  const count = parseInt(bundleWalletsInput.value, 10);
  walletBadge.textContent = count;
  const total = parseFloat(document.getElementById('bundle-buy').value) || 0;
  const perWallet = count > 0 ? total / count : 0;
  document.getElementById('per-wallet-hint').textContent = '≈ ' + perWallet.toFixed(4) + ' SOL per wallet';
  document.getElementById('bundle-buy-hint').textContent = '≈ $' + (total * currentSolPrice).toFixed(2) + ' total, split across wallets below';
}

bundleWalletsInput.addEventListener('input', updateBundleHints);
document.getElementById('bundle-buy').addEventListener('input', updateBundleHints);

imageDrop.addEventListener('click', function () { imageInput.click(); });
imageInput.addEventListener('change', function () {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    pendingImage = ev.target.result;
    imageDrop.innerHTML = '<img src="' + pendingImage + '" alt="">';
  };
  reader.readAsDataURL(file);
});

function escapeHtml(str) {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').textContent = msg;
  toast.classList.add('show');
  setTimeout(function () { toast.classList.remove('show'); }, 2200);
}

function fmtUsd(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function renderCoins() {
  const q = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;
  const filtered = coins.filter(function (c) {
    const matchSearch = !q || c.name.toLowerCase().indexOf(q) !== -1 || c.ticker.toLowerCase().indexOf(q) !== -1;
    const matchFilter = filter === 'All' || c.status === filter;
    return matchSearch && matchFilter;
  });

  coinsEmpty.style.display = coins.length === 0 ? 'block' : 'none';
  coinsGrid.style.display = coins.length > 0 ? 'grid' : 'none';
  coinsCountEl.textContent = coins.length;
  activeCountEl.textContent = coins.filter(function (c) { return c.status === 'Active'; }).length;

  coinsGrid.innerHTML = filtered.map(function (c) {
    const thumb = c.image
      ? '<img src="' + c.image + '" alt="">'
      : '◍';
    return (
      '<div class="coin-card">' +
        '<div class="coin-card-top">' +
          '<div class="coin-thumb">' + thumb + '</div>' +
          '<div><div class="coin-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="coin-ticker">$' + escapeHtml(c.ticker) + '</div></div>' +
          '<span class="coin-status">' + c.status + '</span>' +
        '</div>' +
        '<div class="coin-desc">' + (c.desc ? escapeHtml(c.desc) : '—') + '</div>' +
      '</div>'
    );
  }).join('');
}

coinForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('coin-name').value.trim();
  const ticker = document.getElementById('coin-ticker').value.trim().toUpperCase();
  const desc = document.getElementById('coin-desc').value.trim();
  const devBuy = parseFloat(document.getElementById('dev-buy').value) || 0;
  const slippage = parseFloat(document.getElementById('slippage').value) || 0;
  const bundleBuy = parseFloat(document.getElementById('bundle-buy').value) || 0;
  const bundleWallets = parseInt(document.getElementById('bundle-wallets').value, 10) || 1;

  if (!name || !ticker) return;

  const btn = submitBtnFinal;
  btn.disabled = true;
  btn.textContent = 'Launching…';

  setTimeout(function () {
    const buyTotal = (devBuy + bundleBuy) * currentSolPrice;
    coins.push({
      name: name,
      ticker: ticker,
      desc: desc,
      image: pendingImage,
      status: 'Active',
      devBuy: devBuy,
      slippage: slippage,
      bundleBuy: bundleBuy,
      bundleWallets: bundleWallets
    });
    closeModal();
    renderCoins();
    btn.disabled = false;
    btn.textContent = 'Launch coin';
    showToast('"' + name + '" ($' + ticker + ') launched');
  }, 700);
});

searchInput.addEventListener('input', renderCoins);
filterSelect.addEventListener('change', renderCoins);
renderCoins();
