# Database Schema

## Tables

We will start with 4 core tables:

1. `profiles`
2. `sessions`
3. `session_participants`
4. `messages`

`auth.users` is already managed by Supabase Auth, so we usually do not create our own `users` table from scratch.

## Relationships

- one auth user has one profile
- one session has many participants
- one session has many messages

## Table Details

### `profiles`

Stores app-specific user information.

Fields:

- `id` UUID primary key, references `auth.users.id`
- `full_name` text
- `role` text, either `mentor` or `student`
- `created_at` timestamp

### `sessions`

Stores mentorship session information.

Fields:

- `id` UUID primary key
- `mentor_id` UUID, references `profiles.id`
- `student_id` UUID nullable, references `profiles.id`
- `title` text
- `status` text (`waiting`, `active`, `ended`)
- `invite_code` text unique
- `started_at` timestamp nullable
- `ended_at` timestamp nullable
- `created_at` timestamp

### `session_participants`

Tracks who joined a session and when.

Fields:

- `id` UUID primary key
- `session_id` UUID, references `sessions.id`
- `user_id` UUID, references `profiles.id`
- `joined_at` timestamp
- `left_at` timestamp nullable

### `messages`

Stores chat messages.

Fields:

- `id` UUID primary key
- `session_id` UUID, references `sessions.id`
- `sender_id` UUID, references `profiles.id`
- `content` text
- `message_type` text (`user`, `system`)
- `created_at` timestamp

## Notes

- We can add `code_snapshots` later if needed.
- For MVP editor sync, live socket state is enough.
- We only support one mentor and one student per session.
