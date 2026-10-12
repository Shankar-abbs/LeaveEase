import PageLoading from '@/components/PageLoading';

export default function HistoryLoading() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <PageLoading title="Loading Leave History…" />
    </div>
  );
}
