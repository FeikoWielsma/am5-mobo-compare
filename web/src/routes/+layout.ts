export const prerender = false;
export const ssr = false;

export async function load({ fetch }: { fetch: any }) {
  const [resBoards, resMeta] = await Promise.all([
    fetch('/data/boards.json'),
    fetch('/data/build-meta.json').catch(() => null)
  ]);
  const boards = await resBoards.json();
  const buildMeta = resMeta && resMeta.ok ? await resMeta.json() : null;
  return { boards, buildMeta };
}
