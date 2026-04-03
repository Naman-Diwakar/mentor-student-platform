# Mentor Student Platform

Mentor Student Platform is a full-stack 1-on-1 collaboration app built for live mentorship sessions. The goal of the project is to give one mentor and one student a focused shared workspace where they can talk, message, and code together in real time.

The app combines authentication, private session management, live chat, collaborative coding, and video calling in one flow. A mentor creates a session, shares the invite code or join link, and the student joins the same workspace instantly.

## What the project does

- secure sign up and login with mentor and student roles
- mentor creates a private live session
- student joins with an invite code or join link
- real-time chat inside the session
- shared Monaco code editor with Yjs collaboration
- 1-on-1 WebRTC video and audio call
- instant session exit and end-session flow

## Tech stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Socket.io client
- Monaco Editor
- Yjs + y-websocket

### Backend

- Node.js
- Express
- Socket.io
- Supabase

### Realtime systems

- WebRTC for audio/video
- Socket.io for signaling and session events
- Yjs for collaborative editor sync

## Project structure

```text
.
├── apps
│   ├── server
│   │   ├── src
│   │   └── package.json
│   └── web
│       ├── src
│       └── package.json
├── docs
├── supabase
├── package.json
└── README.md
```

## Main features

### 1. Authentication

Users can create accounts and sign in based on their role:

- mentor
- student

Role information is stored in Supabase and used to control the dashboard and session flow.

### 2. Session workflow

- mentor creates a session
- the app generates an invite code
- a student joins using that code or direct join link
- both users land in the same live room

### 3. Live session room

The room is designed as a combined workspace with:

- shared code editor
- live messages
- video/audio panel
- session controls

### 4. Collaborative editor

The editor is built with Monaco and synced with Yjs. This allows both participants to work on the same code in real time.

### 5. Video and audio

The calling flow uses WebRTC for direct media communication and Socket.io for signaling between participants.

## Local development setup

### Prerequisites

- Node.js 20 or newer
- npm
- Supabase project

### Install dependencies

From the project root:

```powershell
npm install
```

## Environment variables

Create a `.env` file in the project root based on `.env.example`.

Required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_COLLAB_SERVER_URL=ws://localhost:1234
SERVER_PORT=4000
CLIENT_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=
```

### Notes

- `NEXT_PUBLIC_API_BASE_URL` points to the Express backend
- `NEXT_PUBLIC_COLLAB_SERVER_URL` points to the Yjs websocket server
- `CLIENT_URL` should match the frontend URL
- `SUPABASE_SERVICE_ROLE_KEY` is required only on the backend

## Running the project locally

Start each service in a separate terminal from the project root.

### Frontend

```powershell
npm run dev:web
```

### Backend

```powershell
npm run dev:server
```

### Collaborative editor websocket server

```powershell
npm run dev:collab
```

The frontend runs on:

- `http://localhost:3000`

The backend runs on:

- `http://localhost:4000`

The Yjs websocket server runs on:

- `ws://localhost:1234`

## Useful scripts

```powershell
npm run build
npm run build:web
npm run build:server
npm run start:web
npm run start:server
npm run typecheck:web
npm run typecheck:server
```

## Database and auth

Supabase is used for:

- auth
- profile storage
- sessions
- participants
- messages

RLS should be enabled with the required policies for the app tables.

## Deployment plan

This project is split into three running parts:

1. Next.js frontend
2. Express + Socket.io backend
3. Yjs websocket server

### Frontend deployment

The frontend can be deployed to Vercel.

Frontend environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_COLLAB_SERVER_URL=
```

### Backend deployment

The backend can be deployed to Render, Railway, or another Node host.

Backend environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SERVER_PORT=
CLIENT_URL=
```

### Collab websocket deployment

The Yjs websocket server also needs to run in production. It can be deployed as a separate service on Render or Railway using the same repository.

Production command:

```powershell
node apps/web/node_modules/y-websocket/bin/server.js
```

### Production checklist

- deploy frontend
- deploy backend
- deploy collab websocket server
- update frontend envs with production backend and collab URLs
- update backend `CLIENT_URL` with the production frontend URL
- verify Supabase auth redirect settings
- verify CORS origins

## Manual test checklist

- sign up as mentor
- sign up as student
- mentor creates session
- student joins session
- chat works in real time
- code editor sync works in real time
- video and audio connect
- mentor can end session
- student leaves session cleanly

## Future improvements

- persistent session history
- richer session analytics
- file upload or code snippets
- screen sharing
- better moderation/session controls

## Summary

This project is a real-time mentor and student collaboration platform designed around a simple workflow:

- create a session
- join the room
- talk
- message
- code together

Everything is organized around making 1-on-1 live technical mentoring smooth and focused.
