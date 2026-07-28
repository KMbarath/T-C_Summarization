/* LexScan – main.js  (with translation + TTS) */

// ── State ─────────────────────────────────────
let currentSentences = [];   // original English sentences
let currentLang = 'en';
let currentAudio = null;
let audioQueue  = [];
let queueIndex  = 0;

// ── Tab switching ─────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('pane-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Drag & Drop ───────────────────────────────
const dropZone   = document.getElementById('drop-zone');
const imageInput = document.getElementById('image-input');
const filePreview= document.getElementById('file-preview');
let selectedFile = null;

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile(file);
});
imageInput.addEventListener('change', () => { if (imageInput.files[0]) handleFile(imageInput.files[0]); });

function handleFile(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    filePreview.innerHTML = `
      <img src="${e.target.result}" alt="Preview">
      <span class="file-name-label">${file.name} (${(file.size/1024).toFixed(1)} KB)</span>`;
  };
  reader.readAsDataURL(file);
}

// ── Analyze ───────────────────────────────────
document.getElementById('analyze-btn').addEventListener('click', analyze);

async function analyze() {
  const activeTab = document.querySelector('.tab.active').dataset.tab;
  const formData  = new FormData();

  if (activeTab === 'image') {
    if (!selectedFile) { showToast('Please select an image file first.'); return; }
    formData.append('image', selectedFile);
  } else {
    const text = document.getElementById('raw-text').value.trim();
    if (!text) { showToast('Please paste some text first.'); return; }
    formData.append('raw_text', text);
  }
  formData.append('num_sentences', document.getElementById('num-sentences').value);

  stopAudio();
  document.getElementById('results').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  setLoadingText('Extracting & analyzing text...');
  animateSteps(['step1','step2','step3','step4'], 600);

  try {
    const res  = await fetch('/extract', { method: 'POST', body: formData });
    const data = await res.json();
    document.getElementById('loading').classList.add('hidden');
    if (data.error) { showToast(data.error); return; }

    currentSentences = data.tagged_sentences.map(t => t.sentence);
    currentLang = 'en';
    document.getElementById('lang-select').value = 'en';
    renderResults(data);
  } catch(err) {
    document.getElementById('loading').classList.add('hidden');
    showToast('Something went wrong. Is the Flask server running?');
  }
}

// ── Render results ────────────────────────────
const CAT_CLASS = {
  'Payment & Billing':'payment','Privacy & Data':'privacy','User Rights':'rights',
  'Termination':'termination','Liability':'liability','Intellectual Property':'ip',
  'Dispute Resolution':'dispute','General Terms':'general',
};

function renderResults(data) {
  const { tagged_sentences, stats, raw_text_preview } = data;

  // Stats
  document.getElementById('stats-bar').innerHTML = [
    { val: stats.original_words.toLocaleString(), lbl:'Original Words' },
    { val: stats.summary_words.toLocaleString(),  lbl:'Summary Words' },
    { val: stats.reduction + '%',                 lbl:'Reduction' },
    { val: stats.total_sentences,                 lbl:'Sentences Found' },
    { val: stats.elapsed + 's',                   lbl:'Processing Time' },
  ].map((s,i) =>
    `<div class="stat-card" style="animation-delay:${i*0.08}s">
      <span class="s-val">${s.val}</span><span class="s-lbl">${s.lbl}</span>
    </div>`
  ).join('');

  renderCards(tagged_sentences);
  document.getElementById('raw-preview-text').textContent = raw_text_preview;
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('results').scrollIntoView({ behavior:'smooth' });
}

function renderCards(items) {
  document.getElementById('cards-grid').innerHTML = items.map((item, i) => {
    const cls = CAT_CLASS[item.category] || 'general';
    return `
      <div class="clause-card border-${cls}" style="animation-delay:${i*0.09}s" id="card-${i}">
        <div class="clause-top">
          <span class="clause-tag tag-${cls}">${item.category}</span>
          <span class="clause-idx">#${i+1}</span>
        </div>
        <p class="clause-text" id="text-${i}">${escapeHtml(item.sentence)}</p>
        <div class="card-actions">
          <button class="btn-voice" onclick="speakCard(${i})" id="voice-btn-${i}">
            &#128266; Listen
          </button>
          <span class="card-lang-indicator" id="lang-ind-${i}"></span>
        </div>
      </div>`;
  }).join('');
}

// ── Translation ───────────────────────────────
document.getElementById('translate-btn').addEventListener('click', translateSummary);

async function translateSummary() {
  const lang = document.getElementById('lang-select').value;
  if (!currentSentences.length) { showToast('Analyze a document first.'); return; }

  stopAudio();
  currentLang = lang;

  if (lang === 'en') {
    // Restore originals
    const orig = Array.from(document.querySelectorAll('.clause-text'));
    orig.forEach((el, i) => { el.textContent = currentSentences[i] || el.textContent; });
    updateLangIndicators('EN');
    return;
  }

  // Show shimmer
  document.querySelectorAll('.clause-text').forEach(el => el.parentElement.classList.add('translating'));
  setLoadingText('Translating...');
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('results').classList.add('hidden');
  animateSteps(['step5'], 400);

  try {
    const res  = await fetch('/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentences: currentSentences, target_lang: lang }),
    });
    const data = await res.json();
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');

    if (data.error) { showToast(data.error); return; }

    data.translated.forEach((t, i) => {
      const el = document.getElementById(`text-${i}`);
      if (el) el.textContent = t;
    });
    document.querySelectorAll('.clause-text').forEach(el => el.parentElement.classList.remove('translating'));

    const langName = document.getElementById('lang-select').options[document.getElementById('lang-select').selectedIndex].text;
    updateLangIndicators(langName);
    showToast(`Translated to ${langName}`, 'success');
  } catch(err) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');
    showToast('Translation failed. Check your internet connection.');
  }
}

function updateLangIndicators(langName) {
  document.querySelectorAll('.card-lang-indicator').forEach(el => {
    el.textContent = langName !== 'EN' ? `🌐 ${langName}` : '';
    el.style.cssText = 'font-family:var(--font-mono);font-size:0.72rem;color:var(--accent);margin-left:auto';
  });
}

// ── Text-to-Speech ─────────────────────────────
document.getElementById('voice-speed').addEventListener('input', function() {
  document.getElementById('speed-val').textContent = parseFloat(this.value).toFixed(1) + 'x';
});

async function speakCard(index) {
  const textEl = document.getElementById(`text-${index}`);
  const btn    = document.getElementById(`voice-btn-${index}`);
  if (!textEl) return;

  const text = textEl.textContent.trim();
  if (!text) return;

  // If already playing this card, stop it
  if (btn.classList.contains('playing')) { stopAudio(); return; }
  stopAudio();

  btn.classList.add('playing');
  btn.innerHTML = `<span class="wave-icon"><span></span><span></span><span></span><span></span><span></span></span> Playing`;

  await streamTTS(text, currentLang, btn);
}

// Read all cards in sequence
document.getElementById('read-all-btn').addEventListener('click', async () => {
  const cards = document.querySelectorAll('.clause-text');
  if (!cards.length) return;
  stopAudio();

  document.getElementById('read-all-btn').style.display = 'none';
  document.getElementById('stop-btn').style.display = '';

  for (let i = 0; i < cards.length; i++) {
    if (!window._reading) break;
    const btn = document.getElementById(`voice-btn-${i}`);
    btn && btn.classList.add('playing');
    btn && (btn.innerHTML = `<span class="wave-icon"><span></span><span></span><span></span><span></span><span></span></span> Playing`);
    await streamTTS(cards[i].textContent.trim(), currentLang, btn);
    btn && btn.classList.remove('playing');
    btn && (btn.innerHTML = '&#128266; Listen');
  }

  document.getElementById('read-all-btn').style.display = '';
  document.getElementById('stop-btn').style.display = 'none';
  window._reading = false;
});

document.getElementById('stop-btn').addEventListener('click', () => {
  stopAudio();
  document.getElementById('read-all-btn').style.display = '';
  document.getElementById('stop-btn').style.display = 'none';
});

async function streamTTS(text, lang, btn) {
  return new Promise(async (resolve) => {
    try {
      const res = await fetch('/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'TTS failed');
        resetBtn(btn); resolve(); return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = parseFloat(document.getElementById('voice-speed').value);
      currentAudio = audio;
      window._reading = true;

      audio.onended = () => { resetBtn(btn); URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { resetBtn(btn); resolve(); };
      audio.play();
    } catch(e) {
      showToast('TTS request failed.');
      resetBtn(btn); resolve();
    }
  });
}

function resetBtn(btn) {
  if (btn) { btn.classList.remove('playing'); btn.innerHTML = '&#128266; Listen'; }
}

function stopAudio() {
  window._reading = false;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  document.querySelectorAll('.btn-voice').forEach(b => {
    b.classList.remove('playing'); b.innerHTML = '&#128266; Listen';
  });
}

// ── Copy ───────────────────────────────────────
document.getElementById('copy-btn').addEventListener('click', () => {
  const cards = document.querySelectorAll('.clause-text');
  const text  = Array.from(cards).map((c,i) => `${i+1}. ${c.textContent}`).join('\n\n');
  navigator.clipboard.writeText(text).then(() => showToast('Summary copied!', 'success'));
});

// ── Reset ──────────────────────────────────────
document.getElementById('reset-btn').addEventListener('click', () => {
  stopAudio();
  document.getElementById('results').classList.add('hidden');
  selectedFile = null; filePreview.innerHTML = '';
  document.getElementById('raw-text').value = '';
  currentSentences = [];
  document.getElementById('input-panel').scrollIntoView({ behavior:'smooth' });
});

// ── Loading helpers ────────────────────────────
function setLoadingText(msg) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = msg;
}

function animateSteps(ids, interval) {
  let i = 0;
  ids.forEach(id => { const el = document.getElementById(id); if(el) el.classList.remove('active'); });
  const timer = setInterval(() => {
    if (i < ids.length) {
      const el = document.getElementById(ids[i]);
      if (el) el.classList.add('active');
      i++;
    } else { clearInterval(timer); }
  }, interval);
}

// ── Toast ──────────────────────────────────────
function showToast(msg, type='error') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  if (type === 'success') t.style.cssText = 'background:#0d1f12;border-color:#4ecb71;color:#4ecb71';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
