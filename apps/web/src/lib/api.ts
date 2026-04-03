import { getSupabaseBrowserClient } from "./supabase";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type SessionRecord = {
  id: string;
  title: string;
  status: "waiting" | "active" | "ended";
  invite_code: string;
  mentor_id: string;
  student_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error(
      "Supabase environment variables are missing. Add them to apps/web/.env.local and restart the frontend server."
    );
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  const expiresSoon =
    session?.expires_at && session.expires_at * 1000 <= Date.now() + 30_000;

  if (!session?.access_token || expiresSoon) {
    const { data, error } = await supabase.auth.refreshSession();

    if (error || !data.session?.access_token) {
      throw new Error("You must be logged in to call the backend API.");
    }

    return data.session.access_token;
  }

  if (!session?.access_token) {
    throw new Error("You must be logged in to call the backend API.");
  }

  return session.access_token;
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  async function executeRequest(accessToken: string) {
    return fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options?.headers ?? {})
      }
    });
  }

  let accessToken = await getAccessToken();
  let response = await executeRequest(accessToken);

  if (response.status === 401) {
    accessToken = await getAccessToken();
    response = await executeRequest(accessToken);
  }

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }

  return data;
}
