export async function load({ fetch, parent }: { fetch: any; parent: any }) {
  const { boards } = await parent();
  const [resMeta, resFeatures, resStructure] = await Promise.all([
    fetch('/data/build-meta.json'),
    fetch('/data/features.json'),
    fetch('/data/structure.json')
  ]);
  const meta = await resMeta.json();
  const features = await resFeatures.json();
  const structure = await resStructure.json();
  return { boards, meta, features, structure };
}

