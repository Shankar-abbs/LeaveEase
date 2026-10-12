import PageLoading from '@/components/PageLoading';

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <PageLoading title="Connecting to LeaveEase…" />
    </div>
  );
}
