# Architecture Overview

## Main Idea

This project has 3 main parts:

1. frontend app
2. backend server
3. Supabase database/auth

## High-Level Flow

### Frontend (`apps/web`)

The frontend is what mentor and student use in the browser.

Responsibilities:

- login and signup UI
- dashboard
- session room UI
- code editor UI
- chat UI
- video call UI

### Backend (`apps/server`)

The backend handles things we do not want directly inside the browser.

Responsibilities:

- session REST APIs
- Socket.io server
- WebRTC signaling
- session authorization checks
- chat persistence

### Database + Auth (`Supabase`)

Supabase gives us PostgreSQL plus authentication.

Responsibilities:

- store users and profiles
- store sessions
- store messages
- store session states

## Request Flow Example

### Login Flow

1. user signs in on frontend
2. Supabase validates credentials
3. frontend receives auth session
4. frontend uses token for protected APIs and sockets

### Session Join Flow

1. mentor creates session
2. backend creates session record
3. student opens invite link
4. backend checks authorization
5. both users join same socket room

### Editor Sync Flow

1. user types in Monaco Editor
2. frontend emits `editor:update` through Socket.io
3. backend forwards update to the other participant
4. other browser updates editor content

### Video Call Flow

1. both users enter session room
2. frontend captures local media
3. WebRTC offer/answer is exchanged through Socket.io
4. ICE candidates are exchanged
5. peer-to-peer media connection is established

## Simple Architecture Diagram

```text
Browser (Mentor) ----\
                      \        Socket.io + REST        +------------------+
                       +------------------------------> | Express Server   |
                      /                                 | Signaling + APIs |
Browser (Student) ---/                                  +------------------+
                               |                     \
                               |                      \
                               v                       v
                      +----------------+      +-------------------+
                      | Supabase Auth  |      | PostgreSQL DB     |
                      +----------------+      +-------------------+
```

## Why This Architecture Is Good For MVP

- easy to understand
- frontend and backend responsibilities are clearly separated
- Socket.io is simple for real-time features
- Supabase reduces auth and database setup work
- good enough for interviews and demos

## Scope Rules

For the first version, do not build:

- group calls
- recordings
- screen sharing
- CRDT or OT collaboration engines
- code execution sandbox

Keeping scope small is how we finish the project.
