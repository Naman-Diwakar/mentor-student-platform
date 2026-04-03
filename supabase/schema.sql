create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('mentor', 'student')),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete set null,
  title text not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'ended')),
  invite_code text not null unique,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  message_type text not null default 'user' check (message_type in ('user', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists sessions_mentor_id_idx on public.sessions (mentor_id);
create index if not exists sessions_student_id_idx on public.sessions (student_id);
create index if not exists messages_session_id_idx on public.messages (session_id);
create index if not exists participants_session_id_idx on public.session_participants (session_id);
