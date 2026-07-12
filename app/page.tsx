import Link from 'next/link';
import { source } from '@/lib/source';

export default function Home() {
  const projects = source.getPages().filter((page) => page.slugs.length === 1);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm text-fd-muted-foreground">Personal ideas</p>
        <h1 className="text-4xl font-semibold tracking-tight">Idea Garden</h1>
        <p className="max-w-xl text-fd-muted-foreground">
          Duyệt các ý tưởng dự án. Mỗi thẻ mở docs chi tiết tại{' '}
          <code className="text-sm">/{'{project-slug}'}</code>.
        </p>
      </header>

      <ul className="grid gap-4">
        {projects.map((project) => (
          <li key={project.url}>
            <Link
              href={project.url}
              className="block rounded-xl border border-fd-border px-5 py-4 transition-colors hover:bg-fd-accent"
            >
              <h2 className="text-lg font-medium">{project.data.title}</h2>
              {project.data.description ? (
                <p className="mt-1 text-sm text-fd-muted-foreground">
                  {project.data.description}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
