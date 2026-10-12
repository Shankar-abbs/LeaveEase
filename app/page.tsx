import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-brand-950 to-slate-950">
      <div className="text-center animate-fade-in">
        <div className="mb-8 flex justify-center">
          <div className="rounded-3xl bg-brand-600/20 border border-brand-500/30 p-6 backdrop-blur-sm">
            <svg className="w-16 h-16 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
        </div>

        <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">LeaveEase</h1>
        <p className="text-brand-400 font-medium mb-2 text-lg">Kestrel Logistics</p>
        <p className="text-slate-400 mb-10 max-w-sm mx-auto">
          Simple, fast leave management for your entire team.
        </p>

        <Link
          href="/login"
          className="btn-primary text-base px-10 py-4 rounded-2xl shadow-lg shadow-brand-500/25"
        >
          Get Started
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>
    </main>
  );
}
