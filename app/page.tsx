import AppShell from '@/components/AppShell';
import { loadApartments, loadProjectImages, loadProjects, loadRuns } from '@/lib/data.server';

// AppShell reads URL state via nuqs, which needs request context.
// Force dynamic rendering so prerender doesn't try to execute the client tree
// without a request.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [projects, apartments, runs, images] = await Promise.all([
    loadProjects(),
    loadApartments(),
    loadRuns(),
    loadProjectImages(),
  ]);
  return (
    <AppShell projects={projects} apartments={apartments} runs={runs} images={images} />
  );
}
