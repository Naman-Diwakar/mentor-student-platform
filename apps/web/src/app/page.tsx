import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(191,151,92,0.16),transparent_22%),linear-gradient(180deg,#f4efe6_0%,#eee5d8_100%)] px-6 py-10 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col rounded-[36px] border border-[#e2d8c9] bg-[#fbf8f2] p-8 shadow-[0_30px_120px_rgba(41,37,36,0.08)] md:p-12">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b26b1f]">
              Mentor Student Platform
            </p>
          </div>
          <Link
            href="/auth"
            className="rounded-full border border-[#d7cab7] bg-white px-5 py-2.5 text-sm font-semibold text-[#2f2925] transition hover:bg-[#f4ebdf]"
          >
            Log in
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 pt-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-[#1f1a17] md:text-6xl">
              Run focused mentorship sessions with video, chat, and a shared coding workspace.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#6f6253]">
              Create a private room, invite one participant, and collaborate in real time from a single professional workspace.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/auth?mode=signup"
                className="rounded-full bg-[#2f3a32] px-7 py-3.5 text-center text-sm font-semibold text-[#f7f3ea] transition hover:bg-[#243027]"
              >
                Get Started
              </Link>
              <Link
                href="/auth"
                className="rounded-full border border-[#d7cab7] bg-white px-7 py-3.5 text-center text-sm font-semibold text-[#2f2925] transition hover:bg-[#f4ebdf]"
              >
                Open Account
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[30px] border border-[#dfd3c2] bg-[linear-gradient(180deg,#252628_0%,#1c1d1f_100%)] p-5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#c8c0b4]">
                    Session Room
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Live mentoring room</h2>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#f1e6d8]">
                  Live
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111214] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#ff8d7a]" />
                  <span className="h-3 w-3 rounded-full bg-[#f0c36a]" />
                  <span className="h-3 w-3 rounded-full bg-[#8acb88]" />
                </div>
                <pre className="overflow-hidden text-sm leading-7 text-[#e8dccf]">
{`function explain(topic) {
  return "Let's work through " + topic;
}

console.log(explain("recursion"));`}
                </pre>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[28px] border border-[#dfd3c2] bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b26b1f]">
                  Private invite
                </p>
                <p className="mt-3 text-sm leading-7 text-[#5d5348]">
                  Share one invite link and bring one mentor and one student into the same room.
                </p>
              </div>
              <div className="rounded-[28px] border border-[#dfd3c2] bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b26b1f]">
                  Unified workspace
                </p>
                <p className="mt-3 text-sm leading-7 text-[#5d5348]">
                  Video, chat, and collaborative editing stay together in one focused interface.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
