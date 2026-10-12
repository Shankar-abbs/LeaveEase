import PageLoading from '@/components/PageLoading';

export default function TeamCalendarLoading() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <PageLoading title="Loading Team Calendar…" />
    </div>
  );
}
