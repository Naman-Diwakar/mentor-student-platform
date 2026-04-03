"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest, type SessionRecord } from "../../lib/api";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Profile = {
  full_name: string;
  role: "mentor" | "student";
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isJoiningSession, setIsJoiningSession] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setError(
          "Supabase environment variables are missing. Add them to apps/web/.env.local and restart the frontend server."
        );
        setLoading(false);
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push("/auth");
        return;
      }

      setEmail(session.user.email ?? "");

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", session.user.id)
        .single();

      if (profileError) {
        setError(profileError.message);
      } else {
        setProfile(data);
      }

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function handleLogout() {
    setIsLoggingOut(true);
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      router.push("/auth");
      return;
    }

    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  async function handleCreateSession() {
    setError("");
    setIsCreatingSession(true);

    try {
      const data = await apiRequest<{ session: SessionRecord }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: sessionTitle })
      });

      router.push(`/session/${data.session.id}`);
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create session."
      );
    } finally {
      setIsCreatingSession(false);
    }
  }

  async function handleJoinSession() {
    setError("");
    setIsJoiningSession(true);

    try {
      const data = await apiRequest<{ session: SessionRecord }>(
        "/api/sessions/join",
        {
          method: "POST",
          body: JSON.stringify({ inviteCode })
        }
      );

      router.push(`/session/${data.session.id}`);
      router.refresh();
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Could not join session."
      );
    } finally {
      setIsJoiningSession(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f4efe6_0%,#eee5d8_100%)] px-6">
        <div className="rounded-2xl border border-[#dfd3c2] bg-white px-6 py-4 text-[#5f564c] shadow-sm">
          Loading dashboard...
        </div>
      </main>
    );
  }

  const isMentor = profile?.role === "mentor";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(191,151,92,0.12),transparent_18%),linear-gradient(180deg,#f4efe6_0%,#eee5d8_100%)] px-5 py-8 md:px-8">
      <div className="mx-auto max-w-4xl rounded-[34px] border border-[#dfd3c2] bg-[#fbf8f2] p-6 shadow-[0_24px_90px_rgba(41,37,36,0.08)] md:p-8">
        <div className="flex flex-col gap-4 border-b border-[#e7dece] pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b26b1f]">
              Dashboard
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#201a17]">
              {isMentor ? "Start a new live session" : "Join your live session"}
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#6f6253]">
              {isMentor
                ? "Create a room, share the invite code, and move straight into the session workspace."
                : "Enter the invite code from your mentor to access the session instantly."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="rounded-full border border-[#d7cab7] bg-white px-5 py-3 text-sm font-semibold text-[#2f2925] transition hover:bg-[#f4ebdf] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <section className="rounded-[24px] border border-[#dfd3c2] bg-white p-5">
            <p className="text-sm text-[#8a7d6d]">Email</p>
            <h2 className="mt-2 text-xl font-semibold text-[#201a17]">{email}</h2>
          </section>
          <section className="rounded-[24px] border border-[#dfd3c2] bg-white p-5">
            <p className="text-sm text-[#8a7d6d]">Full name</p>
            <h2 className="mt-2 text-xl font-semibold text-[#201a17]">
              {profile?.full_name ?? "Not found"}
            </h2>
          </section>
          <section className="rounded-[24px] border border-[#dfd3c2] bg-white p-5">
            <p className="text-sm text-[#8a7d6d]">Role</p>
            <h2 className="mt-2 text-xl font-semibold capitalize text-[#201a17]">
              {profile?.role ?? "Not found"}
            </h2>
          </section>
        </div>

        <section className="mt-6 rounded-[28px] border border-[#dfd3c2] bg-white p-6 md:p-7">
          <h2 className="text-2xl font-semibold text-[#201a17]">
            {isMentor ? "Create session" : "Join session"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-[#6f6253]">
            {isMentor
              ? "Use a clear title so the session is easy to identify before you invite your student."
              : "Paste the invite code exactly as it was shared with you."}
          </p>

          {isMentor ? (
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="sessionTitle"
                  className="mb-2 block text-sm font-medium text-[#4e433b]"
                >
                  Session title
                </label>
                <input
                  id="sessionTitle"
                  type="text"
                  value={sessionTitle}
                  onChange={(event) => setSessionTitle(event.target.value)}
                  className="w-full rounded-[22px] border border-[#d9cfbe] bg-[#fbf8f2] px-4 py-3 text-[#201a17] outline-none transition focus:border-[#a67c52]"
                  placeholder="Frontend interview mock"
                />
              </div>

              <button
                type="button"
                onClick={handleCreateSession}
                disabled={isCreatingSession || !sessionTitle.trim()}
                className="rounded-full bg-[#2f3a32] px-6 py-3 text-sm font-semibold text-[#f7f3ea] transition hover:bg-[#243027] disabled:cursor-not-allowed disabled:bg-[#7b837c]"
              >
                {isCreatingSession ? "Creating..." : "Create session"}
              </button>
            </div>
          ) : null}

          {!isMentor ? (
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="inviteCode"
                  className="mb-2 block text-sm font-medium text-[#4e433b]"
                >
                  Invite code
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  className="w-full rounded-[22px] border border-[#d9cfbe] bg-[#fbf8f2] px-4 py-3 uppercase text-[#201a17] outline-none transition focus:border-[#a67c52]"
                  placeholder="ABC123"
                />
              </div>

              <button
                type="button"
                onClick={handleJoinSession}
                disabled={isJoiningSession || !inviteCode.trim()}
                className="rounded-full bg-[#2f3a32] px-6 py-3 text-sm font-semibold text-[#f7f3ea] transition hover:bg-[#243027] disabled:cursor-not-allowed disabled:bg-[#7b837c]"
              >
                {isJoiningSession ? "Joining..." : "Join session"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
