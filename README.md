# 🎓 CMS Policy & Parent Handbook Chatbot

An AI-powered, role-based chatbot designed for a **multi-campus Montessori school system** to provide instant, accurate access to **policies, protocols, and parent handbooks**.

This project was built to solve a real operational problem in schools:  
➡️ *staff and parents repeatedly asking the same questions across different campuses and programs.*

---

## ✨ Key Features

### 🔐 Role-Based Access
- **Staff**
  - Access to policies, protocols, and campus-specific handbooks
- **Parents**
  - Access to **Parent Handbooks only**
- **Admin**
  - Full access + analytics dashboard + logs

---

### 🏫 Multi-Campus Support
Each campus has its own data set:
- York Mills (YC)
- Maplehurst (MC)
- Thornhill (TC)
- Willowdale (WC)
- Sheppard (SC)

Users must select a campus before accessing content.

---

### 📘 Structured Parent Handbooks
- Each campus can have **multiple handbooks** (Infant, Casa, Elementary, etc.)
- Each handbook is broken into **clickable sections**
- AI answers questions by matching:
  - campus
  - handbook
  - section

---

### 🤖 AI-Powered Answers
- Uses OpenAI to:
  - identify the most relevant document
  - select the correct handbook **section**
  - return a clear, human-friendly answer
- Falls back gracefully if no exact match is found

---

### 📊 Admin Dashboard
Admins can:
- View total questions asked
- Filter logs by:
  - campus
  - role (staff / parent / admin)
  - source type (policy / protocol / handbook)
- See exactly:
  - **which handbook**
  - **which section**
  - **which campus** was used

---

### 🚦 Built-in Security & Stability
- Token-based authentication
- Role validation on every request
- Rate limiting (KV-based)
- Automatic session expiration
- CORS-safe API

---

## 🧠 Tech Stack

- **Frontend**
  - HTML / CSS / Vanilla JavaScript
  - Modular UI (login, menu, chat, admin)
- **Backend**
  - Cloudflare Workers
  - KV Storage (policies, protocols, handbooks, logs)
- **AI**
  - OpenAI API
- **Auth & Security**
  - Role-based tokens
  - Rate limiting
  - Admin PIN protection

---

## 📂 Data Structure Example (Handbook)

```json
{
  "id": "yc_handbook_elementary",
  "type": "handbook",
  "campus": "YC",
  "program": "Elementary",
  "title": "CMS Elementary Parent Handbook – York Mills Campus",
  "sections": [
    {
      "key": "dropoff_pickup",
      "title": "Drop-Off and Pick-Up",
      "content": "Parents must sign children in and out..."
    }
  ],
  "keywords": ["elementary", "pickup", "arrival"],
  "link": "https://cmschool.net/yc/elementary-parent-handbook"
}
