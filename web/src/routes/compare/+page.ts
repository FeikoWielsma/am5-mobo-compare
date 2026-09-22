export async function load({ fetch, parent }: { fetch: any; parent: any }) {
  const { boards } = await parent();
  const [resLayout, resMeta] = await Promise.all([
    fetch('/data/compare-layout.json'),
    fetch('/data/ui-metadata.json')
  ]);
  const layout = await resLayout.json();
  const uiMeta = await resMeta.json();
  return { boards, layout, uiMeta };
}
