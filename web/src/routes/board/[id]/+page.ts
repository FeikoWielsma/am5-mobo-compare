export async function load({ params, parent }: { params: { id: string }; parent: any }) {
  const { boards } = await parent();
  const board = boards?.find((b: any) => b.id === params.id);
  return { board };
}

