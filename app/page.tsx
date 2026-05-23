import AppShell from '@/components/AppShell';
import { loadApartments, loadProjects } from '@/lib/data.server';

export default async function HomePage() {
  const [projects, apartments] = await Promise.all([loadProjects(), loadApartments()]);
  return <AppShell projects={projects} apartments={apartments} />;
}
