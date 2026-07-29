#Terms & Conditions Summarizer
> Mini Project I · IFET College of Engineering · December 2023  
> Sathish Kumar T S (421122106047) · Barath K M (421122106004)

## What This Does
LexScan is a Flask web app that takes a screenshot (image) of any Terms & Conditions
document **or** raw pasted text, runs it through Tesseract OCR + NLTK NLP, and
produces a clean, colour-coded summary of the most important clauses — sorted by
category (Privacy, Liability, Payment, etc.).

---

## Project Structure
```
terms_summarizer/
├── app.py                  ← Flask backend + NLP logic
├── requirements.txt        ← Python dependencies
├── README.md
├── static/
│   ├── css/style.css       ← All styles (dark gold theme)
│   └── js/main.js          ← Frontend logic
└── templates/
    └── index.html          ← Single-page HTML UI
```

---

## Step 1 – Install Tesseract OCR (system dependency)

**Windows:**
Download from: https://github.com/UB-Mannheim/tesseract/wiki
Install, then add to PATH.

**macOS:**
```bash
brew install tesseract
```

**Ubuntu / Debian:**
```bash
sudo apt-get update && sudo apt-get install tesseract-ocr
```

---

## Step 2 – Create Virtual Environment

```bash
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS/Linux:
source venv/bin/activate
```

---

## Step 3 – Install Python Dependencies

```bash
pip install -r requirements.txt
```

---

## Step 4 – Run the App

```bash
python app.py
```

Open: **http://127.0.0.1:5000**

---

## How to Use

1. **Upload Mode** – Drag & drop or choose a screenshot of any T&C document.
2. **Paste Mode** – Switch tab and paste legal text directly.
3. Choose how many key sentences you want (3/5/8/10).
4. Click Analyze.
5. Results appear with colour-coded category tags and stats.
6. Click Copy Summary to copy to clipboard.

---

## Clause Categories Detected

| Category             | Detects                          |
|----------------------|----------------------------------|
| Payment & Billing    | fees, refunds, subscriptions     |
| Privacy & Data       | data collection, cookies         |
| User Rights          | account access, permissions      |
| Termination          | cancellation, suspension         |
| Liability            | warranties, damages, disclaimers |
| Intellectual Property| copyright, trademarks            |
| Dispute Resolution   | arbitration, jurisdiction        |
| General Terms        | everything else                  |

---

## Troubleshooting

| Problem                     | Fix                                    |
|-----------------------------|----------------------------------------|
| TesseractNotFoundError      | Install Tesseract, add to PATH         |
| ModuleNotFoundError: nltk   | pip install nltk                       |
| Port 5000 in use            | Change port in app.py                  |
| Little text from image      | Use high-res image or Paste Text mode  |
