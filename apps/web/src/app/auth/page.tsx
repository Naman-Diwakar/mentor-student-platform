"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Mode = "login" | "signup";
type Role = "mentor" | "student";

function normalizeAuthError(message: string, mode: Mode) {
  const lower = message.toLowerCase();

  if (mode === "signup" && lower.includes("already registered")) {
    return "This email is already registered. Log in instead or reset your password.";
  }

  if (mode === "login" && lower.includes("invalid login credentials")) {
    return "We could not log you in. If you have not created an account yet, sign up first.";
  }

  return message;
}

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const nextPath = searchParams.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const supabaseReady = Boolean(getSupabaseBrowserClient());

  const pageTitle = useMemo(
    () =>
      mode === "signup"
        ? "Set up your mentor and student account"
        : "Access your workspace",
    [mode]
  );

  async function handleForgotPassword() {
    setError("");
    setMessage("");

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setError(
        "Supabase environment variables are missing. Put NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local, then restart the frontend server."
      );
      return;
    }

    if (!email.trim()) {
      setError("Enter your email first, then click forgot password.");
      return;
    }

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth?mode=login`
        : undefined;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset link sent. Check your inbox and spam folder.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setShowSignupPrompt(false);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setError(
        "Supabase environment variables are missing. Put NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local, then restart the frontend server."
      );
      setLoading(false);
      return;
    }

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password
      });

      if (signUpError) {
        setError(normalizeAuthError(signUpError.message, mode));
        setLoading(false);
        return;
      }

      const identities = data.user?.identities ?? [];
      if (data.user && identities.length === 0) {
        setError("This email is already registered. Log in instead or reset your password.");
        setMode("login");
        setLoading(false);
        return;
      }

      if (data.user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          full_name: fullName,
          role
        });

        if (profileError) {
          setError(profileError.message);
          setLoading(false);
          return;
        }
      }

      if (data.session) {
        router.replace(nextPath);
        router.refresh();
      } else {
        setMessage(
          "Account created. If email confirmation is enabled, confirm your email before logging in."
        );
        setMode("login");
      }

      setLoading(false);
      return;
    }

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
      });

    if (signInError) {
      const friendlyMessage = normalizeAuthError(signInError.message, mode);
      setError(friendlyMessage);

      if (signInError.message.toLowerCase().includes("invalid login credentials")) {
        setShowSignupPrompt(true);
      }

      setLoading(false);
      return;
    }

    if (!signInData.session?.access_token) {
      setError("Your session could not be started. Please try logging in again.");
      setLoading(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(176,141,87,0.18),transparent_25%),linear-gradient(180deg,#f4efe6_0%,#efe7db_100%)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[32px] border border-[#e0d6c7] bg-[#fbf8f2] p-8 shadow-[0_24px_80px_rgba(41,37,36,0.08)] md:p-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a67c52]">
                Authentication
              </p>
              <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-[#201a17]">
                {pageTitle}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f6253]">
                Use one secure account to manage sessions, invite participants, and return to your live workspace.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-full border border-[#d8cbb8] bg-white px-4 py-2 text-sm font-semibold text-[#3f342d] transition hover:bg-[#f5ede1]"
            >
              Home
            </Link>
          </div>

          <div className="mt-8 inline-flex rounded-full border border-[#e0d6c7] bg-[#f3ece1] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-[#2f3a32] text-[#f7f3ea]"
                  : "text-[#6f6253]"
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
                setMessage("");
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-[#2f3a32] text-[#f7f3ea]"
                  : "text-[#6f6253]"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {!supabaseReady ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Supabase keys were not found inside `apps/web/.env.local`. Add them there and restart `npm run dev:web`.
              </p>
            ) : null}

            {mode === "signup" ? (
              <>
                <div>
                  <label
                    htmlFor="fullName"
                    className="mb-2 block text-sm font-medium text-[#4e433b]"
                  >
                    Full name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    className="w-full rounded-[22px] border border-[#d9cfbe] bg-white px-4 py-3 text-[#201a17] outline-none transition focus:border-[#a67c52]"
                    placeholder="Your full name"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#4e433b]">
                    Role
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setRole("mentor")}
                      className={`rounded-[22px] border px-4 py-3 text-left transition ${
                        role === "mentor"
                          ? "border-[#a67c52] bg-[#efe5d7] text-[#3d322a]"
                          : "border-[#d9cfbe] bg-white text-[#6f6253]"
                      }`}
                    >
                      <div className="font-semibold">Mentor</div>
                      <div className="mt-1 text-sm opacity-75">Create and guide sessions.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("student")}
                      className={`rounded-[22px] border px-4 py-3 text-left transition ${
                        role === "student"
                          ? "border-[#a67c52] bg-[#efe5d7] text-[#3d322a]"
                          : "border-[#d9cfbe] bg-white text-[#6f6253]"
                      }`}
                    >
                      <div className="font-semibold">Student</div>
                      <div className="mt-1 text-sm opacity-75">Join with an invite code.</div>
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-[#4e433b]"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded-[22px] border border-[#d9cfbe] bg-white px-4 py-3 text-[#201a17] outline-none transition focus:border-[#a67c52]"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-[#4e433b]"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm font-medium text-[#8b5e34] transition hover:text-[#6f4a28]"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  className="w-full rounded-[22px] border border-[#d9cfbe] bg-white px-4 py-3 pr-14 text-[#201a17] outline-none transition focus:border-[#a67c52]"
                  placeholder="Minimum 6 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-sm font-medium text-[#8b5e34] transition hover:bg-[#f5ede1]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </p>
            ) : null}

            {showSignupPrompt ? (
              <div className="rounded-[24px] border border-[#d9cfbe] bg-[#f5efe4] px-4 py-4 text-sm text-[#4e433b]">
                <p className="font-semibold text-[#201a17]">Need an account first?</p>
                <p className="mt-1 leading-6">
                  We could not find a valid account for this login. Create your account first, then come back to log in.
                </p>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="mt-3 rounded-full bg-[#2f3a32] px-4 py-2 text-sm font-semibold text-[#f7f3ea] transition hover:bg-[#243027]"
                >
                  Go to sign up
                </button>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !supabaseReady}
              className="w-full rounded-full bg-[#2f3a32] px-6 py-3 text-sm font-semibold text-[#f7f3ea] transition hover:bg-[#243027] disabled:cursor-not-allowed disabled:bg-[#8f8577]"
            >
              {loading
                ? "Please wait..."
                : mode === "signup"
                  ? "Create account"
                  : "Log in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
