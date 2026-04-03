"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest, type SessionRecord } from "../../../lib/api";
import { getSupabaseBrowserClient } from "../../../lib/supabase";

export default function JoinByLinkPage() {
  const router = useRouter();
  const params = useParams<{ inviteCode: string }>();
  const [message, setMessage] = useState("Checking your account...");
  const [error, setError] = useState("");
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);

  useEffect(() => {
    async function joinSessionFromLink() {
      setIsRetryingAuth(true);
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setError(
          "Supabase environment variables are missing. Add them to apps/web/.env.local and restart the frontend server."
        );
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push(`/auth?next=/join/${params.inviteCode}`);
        return;
      }

      setMessage("Joining the session...");

      try {
        const data = await apiRequest<{ session: SessionRecord }>(
          "/api/sessions/join",
          {
            method: "POST",
            body: JSON.stringify({ inviteCode: params.inviteCode })
          }
        );

        router.push(`/session/${data.session.id}`);
      } catch (joinError) {
        setError(
          joinError instanceof Error
            ? joinError.message
            : "Could not join the session."
        );
      } finally {
        setIsRetryingAuth(false);
      }
    }

    joinSessionFromLink();
  }, [params.inviteCode, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6">
      <div className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">
          Join Session
        </h1>
        {!error ? (
          <p className="mt-4 text-base text-stone-600">{message}</p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
            {error.toLowerCase().includes("token") ? (
              <button
                type="button"
                onClick={() => router.push("/auth")}
                disabled={isRetryingAuth}
                className="rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Sign in again
              </button>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
