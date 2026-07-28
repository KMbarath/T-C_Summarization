from flask import Flask, render_template, request, jsonify, send_file
from PIL import Image
import pytesseract
import io
import nltk
import os
import re
import time

# ── NLTK downloads ────────────────────────────
for pkg, path in [('punkt','tokenizers/punkt'), ('punkt_tab','tokenizers/punkt_tab'), ('stopwords','corpora/stopwords')]:
    try:
        nltk.data.find(path)
    except LookupError:
        nltk.download(pkg)

from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords

# ── Translation & TTS ─────────────────────────
try:
    from deep_translator import GoogleTranslator
    TRANSLATION_AVAILABLE = True
except ImportError:
    TRANSLATION_AVAILABLE = False

try:
    from gtts import gTTS
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# ── Supported languages ───────────────────────
LANGUAGES = {
    'en': 'English',
    'ta': 'Tamil',
    'hi': 'Hindi',
    'te': 'Telugu',
    'kn': 'Kannada',
    'ml': 'Malayalam',
    'bn': 'Bengali',
    'mr': 'Marathi',
    'gu': 'Gujarati',
    'pa': 'Punjabi',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh-CN': 'Chinese (Simplified)',
    'ar': 'Arabic',
    'tr': 'Turkish',
    'nl': 'Dutch',
    'pl': 'Polish',
    'sv': 'Swedish',
    'uk': 'Ukrainian',
}

# ── NLP helpers ───────────────────────────────
def preprocess_text(text):
    text = re.sub(r'\n+', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\x00-\x7F]+', '', text)
    return text.strip()

def score_sentences(sentences):
    stop_words = set(stopwords.words('english'))
    word_freq = {}
    for sentence in sentences:
        for word in word_tokenize(sentence.lower()):
            if word.isalpha() and word not in stop_words:
                word_freq[word] = word_freq.get(word, 0) + 1

    legal_keywords = {
        'agree','agreement','terms','conditions','policy','service','user','account',
        'data','privacy','personal','information','rights','responsibilities','payment',
        'refund','terminate','liability','warranty','intellectual','property','consent',
        'prohibited','violation','legal','binding','obligation','third','party',
        'confidential','dispute','governing','law','indemnify','damages','limitation',
        'jurisdiction','arbitration',
    }

    scores = {}
    for i, sentence in enumerate(sentences):
        words = word_tokenize(sentence.lower())
        score = sum(word_freq.get(w, 0) for w in words if w.isalpha())
        score += sum(1 for w in words if w in legal_keywords) * 3
        length = len(words)
        if length < 5:   score *= 0.5
        elif length > 60: score *= 0.8
        scores[i] = score
    return scores

def summarize(text, num_sentences=5):
    sentences = sent_tokenize(text)
    if not sentences: return [], []
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
    if not sentences: return [], []
    scores = score_sentences(sentences)
    ranked = sorted(scores, key=scores.get, reverse=True)
    top_indices = sorted(ranked[:num_sentences])
    return [sentences[i] for i in top_indices], sentences

def categorize_clauses(sentences):
    categories = {
        'Payment & Billing':    ['payment','billing','fee','charge','refund','subscription','price','cost'],
        'Privacy & Data':       ['privacy','data','personal','information','collect','store','share','cookie'],
        'User Rights':          ['right','user','access','account','permission','license','use'],
        'Termination':          ['terminat','cancel','suspend','discontinu','end','close'],
        'Liability':            ['liability','warrant','damage','indemnif','responsib','disclaim'],
        'Intellectual Property':['intellectual','property','copyright','trademark','patent','content'],
        'Dispute Resolution':   ['dispute','arbitration','governing','law','jurisdiction','court'],
    }
    tagged = []
    for sentence in sentences:
        s_lower = sentence.lower()
        matched = 'General Terms'
        for cat, keywords in categories.items():
            if any(kw in s_lower for kw in keywords):
                matched = cat
                break
        tagged.append({'sentence': sentence, 'category': matched})
    return tagged

# ── Routes ─────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html', languages=LANGUAGES,
                           translation_available=TRANSLATION_AVAILABLE,
                           tts_available=TTS_AVAILABLE)

@app.route('/extract', methods=['POST'])
def extract_text():
    start = time.time()
    if 'image' in request.files and request.files['image'].filename:
        try:
            img = Image.open(io.BytesIO(request.files['image'].read()))
            raw_text = pytesseract.image_to_string(img)
        except Exception as e:
            return jsonify({'error': f'Image processing failed: {str(e)}'}), 400
    elif request.form.get('raw_text', '').strip():
        raw_text = request.form['raw_text']
    else:
        return jsonify({'error': 'Please upload an image or paste text.'}), 400

    cleaned = preprocess_text(raw_text)
    if len(cleaned) < 50:
        return jsonify({'error': 'Not enough text. Try a clearer image or paste text directly.'}), 400

    num_sentences = int(request.form.get('num_sentences', 5))
    summary_sents, all_sents = summarize(cleaned, num_sentences)
    tagged = categorize_clauses(summary_sents)

    elapsed = round(time.time() - start, 2)
    word_count_original = len(cleaned.split())
    word_count_summary  = sum(len(t['sentence'].split()) for t in tagged)
    reduction = round((1 - word_count_summary / max(word_count_original, 1)) * 100)

    return jsonify({
        'tagged_sentences': tagged,
        'stats': {
            'original_words': word_count_original,
            'summary_words':  word_count_summary,
            'reduction':      reduction,
            'total_sentences':len(all_sents),
            'elapsed':        elapsed,
        },
        'raw_text_preview': cleaned[:500] + ('...' if len(cleaned) > 500 else ''),
    })

@app.route('/translate', methods=['POST'])
def translate():
    if not TRANSLATION_AVAILABLE:
        return jsonify({'error': 'Translation not available. Run: pip install deep-translator'}), 503

    data = request.get_json()
    sentences = data.get('sentences', [])
    target_lang = data.get('target_lang', 'en')

    if not sentences:
        return jsonify({'error': 'No sentences provided.'}), 400
    if target_lang == 'en':
        return jsonify({'translated': sentences})

    try:
        translator = GoogleTranslator(source='auto', target=target_lang)
        translated = []
        for s in sentences:
            try:
                translated.append(translator.translate(s))
            except Exception:
                translated.append(s)  # fallback to original if one fails
        return jsonify({'translated': translated})
    except Exception as e:
        return jsonify({'error': f'Translation failed: {str(e)}'}), 500

@app.route('/tts', methods=['POST'])
def text_to_speech():
    if not TTS_AVAILABLE:
        return jsonify({'error': 'TTS not available. Run: pip install gtts'}), 503

    data = request.get_json()
    text = data.get('text', '').strip()
    lang = data.get('lang', 'en')

    if not text:
        return jsonify({'error': 'No text provided.'}), 400

    try:
        tts = gTTS(text=text, lang=lang, slow=False)
        mp3_fp = io.BytesIO()
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        return send_file(mp3_fp, mimetype='audio/mpeg', as_attachment=False)
    except Exception as e:
        return jsonify({'error': f'TTS failed: {str(e)}'}), 500

@app.route('/languages')
def get_languages():
    return jsonify(LANGUAGES)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
