import PageLoading from '@/components/PageLoading';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <PageLoading title="Loading your Dashboard…" />
    </div>
  );
}
