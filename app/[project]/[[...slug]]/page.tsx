import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

function getSlugs(project: string, slug?: string[]) {
  return [project, ...(slug ?? [])];
}

export default async function Page({
  params,
}: {
  params: Promise<{ project: string; slug?: string[] }>;
}) {
  const { project, slug } = await params;
  const page = source.getPage(getSlugs(project, slug));
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams().map((param) => {
    const [project, ...slug] = param.slug;
    return { project, slug };
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { project, slug } = await params;
  const page = source.getPage(getSlugs(project, slug));
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
