export default function PageLoading({ title = 'Loading LeaveEase…' }: { title?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center animate-fade-in">
      <div className="relative mb-6">
        {/* Glowing backdrop pulse */}
        <div className="absolute -inset-2 rounded-2xl bg-brand-500/20 blur-xl animate-pulse" />
        
        {/* Animated Icon Card */}
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 border border-brand-500/30 shadow-2xl shadow-brand-500/20">
          <svg className="w-8 h-8 text-brand-400 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-slate-200 tracking-wide animate-pulse">
        {title}
      </h3>
      <p className="text-xs text-slate-500 mt-1 max-w-xs">
        Syncing your attendance & leave data securely
      </p>

      {/* Subtle skeleton bar */}
      <div className="w-48 h-1.5 bg-slate-800 rounded-full mt-5 overflow-hidden">
        <div className="w-full h-full bg-gradient-to-r from-transparent via-brand-500 to-transparent animate-[shimmer_1.5s_infinite]" />
      </div>
    </div>
  );
}
