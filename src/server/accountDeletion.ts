const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "dream-images";

function headers(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...extra };
}

async function listFolder(prefix: string): Promise<Array<{ name: string; id?: string | null }>> {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!response.ok) throw new Error(`Could not list private dream images (${response.status})`);
  return response.json();
}

async function collectObjectPaths(prefix: string): Promise<string[]> {
  const rows = await listFolder(prefix);
  const paths: string[] = [];
  for (const row of rows) {
    if (!row?.name) continue;
    const path = `${prefix}${row.name}`;
    if (row.id) paths.push(path);
    else paths.push(...await collectObjectPaths(`${path}/`));
  }
  return paths;
}

export async function deleteUserAccount(userId: string) {
  // Storage objects do not participate in Postgres FK cascades, so remove the
  // entire private image subtree before deleting the Auth identity.
  const paths = await collectObjectPaths(`${userId}/`);
  if (paths.length) {
    const deleteStorage = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: headers(),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!deleteStorage.ok) throw new Error(`Could not delete private dream images (${deleteStorage.status}): ${await deleteStorage.text()}`);
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) throw new Error(`Account deletion failed (${response.status}): ${await response.text()}`);
}
