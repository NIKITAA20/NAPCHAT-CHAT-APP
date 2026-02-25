# 💬 NapChat

> **Real-time chat & video calling app** — built with React, Socket.IO, WebRTC, and Redis.

🌐 **Live:** [https://napchat-chat-app.vercel.app/](https://napchat-chat-app.vercel.app/)

---

## ✨ Features

- 🔐 **Username-based auth** — instant login, no signup needed
- 💬 **Real-time private messaging** — powered by Socket.IO
- 📹 **HD Video & Audio calling** — peer-to-peer via WebRTC
- 🔔 **Incoming call UI** — ringtone, accept/decline overlay
- 📎 **In-call chat** — send messages & files during a live call
- 🟢 **Online presence** — see who's online in real time
- 🔴 **Unread message badges** — per-user unread counts
- 📵 **Missed call notifications** — saved in chat history
- 📷 **Camera toggle** — avatar fallback when camera is off
- 🔇 **Mute toggle** — one-tap audio control during calls
- 📱 **Mobile responsive** — works on phone & desktop

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Real-time | Socket.IO |
| Video/Audio | WebRTC (STUN + TURN) |
| Backend | Node.js + Express |
| Storage | Redis (chat history, online users, unread counts) |
| Deployment | Vercel (frontend) + Render (backend) |

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/napchat.git
cd napchat
```

### 2. Install dependencies

```bash
# Frontend
cd client
npm install

# Backend
cd ../server
npm install
```

### 3. Set up environment variables

**Client** — create `client/.env`:
```env
VITE_SOCKET_URL=http://localhost:5000
VITE_TURN_USERNAME=your_turn_username
VITE_TURN_CREDENTIAL=your_turn_credential
```

**Server** — create `server/.env`:
```env
PORT=5000
CLIENT_URL=http://localhost:5173
REDIS_URL=your_redis_url
```


### 4. Run locally

```bash
# Start backend
cd server
npm run dev

# Start frontend (new terminal)
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — enter any username to start.

---

## 📁 Project Structure

```
napchat/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   └── Chat.jsx          # Main page — manages call state
│   │   ├── components/
│   │   │   ├── Sidebar/
│   │   │   │   └── Sidebar.jsx       # Online users list
│   │   │   ├── Chat/
│   │   │   │   └── ChatBox.jsx       # Private chat window
│   │   │   └── Call/
│   │   │       ├── CallOverlay.jsx   # Video call UI + WebRTC logic
│   │   │       └── IncomingCall.jsx  # Incoming call popup
│   │   └── services/
│   │       └── socket.js         # Socket.IO client instance
│
└── server/                  # Node.js backend
    ├── socket.js             # All Socket.IO event handlers
    └── redis.js              # Redis client setup
```

---

## 📞 How Calling Works

```
Caller                          Receiver
  │                                │
  │──── call-user (offer) ────────▶│
  │                                │── incoming-call shown
  │                                │── user accepts
  │◀─── answer-call (answer) ──────│
  │                                │
  │◀──▶ ice-candidate exchange ────│
  │                                │
  │    WebRTC P2P connected 🎉     │
  │◀──────── media flows ─────────▶│
```

- **STUN** resolves public IPs for direct peer connection
- **TURN** relays media when direct connection fails (different networks, strict NAT)
- ICE candidates are flushed after remote description is set for reliability

---

## 🔧 Key Implementation Details

- **No duplicate calls** — `callActiveRef` blocks re-entrant `incoming-call` events
- **Stale closure safe** — `callStatusRef` mirrors React state for use inside `setTimeout`
- **Single timer** — call duration owned by `onconnectionstatechange` only
- **Proper cleanup** — `connectingRef` resets on call end so second calls work
- **Socket lifecycle** — named handlers with `socket.off` ensure no listener leaks
- **Mobile safe** — no manual `.play()` on video; `autoPlay` attribute handles it

---

## 🌐 Deployment

### Frontend (Vercel)
```bash
cd client
vercel --prod
```
Set environment variables in Vercel dashboard.

### Backend (Railway / Render)
Push `server/` to your platform of choice. Set:
- `CLIENT_URL` = your Vercel frontend URL
- `REDIS_URL` = your Redis instance URL

---

## 📄 License

MIT — feel free to use, fork, and build on it.

---

<div align="center">
  Made with ❤️ — <a href="https://napchat-chat-app.vercel.app/">napchat-chat-app.vercel.app</a>
</div>
