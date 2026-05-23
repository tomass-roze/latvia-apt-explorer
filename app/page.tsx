import AppShell from '@/components/AppShell';
import { loadApartments, loadProjects, loadRuns } from '@/lib/data.server';

export default async function HomePage() {
  const [projects, apartments, runs] = await Promise.all([
    loadProjects(),
    loadApartments(),
    loadRuns(),
  ]);
  return <AppShell projects={projects} apartments={apartments} runs={runs} />;
}
