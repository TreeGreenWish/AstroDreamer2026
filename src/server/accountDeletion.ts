const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...extra };
}

export async function deleteUserAccount(userId: string) {
  // Storage objects do not participate in Postgres FK cascades, so remove the
  // user's private image folder before deleting the Auth identity.
  const listResponse = await fetch(`${supabaseUrl}/storage/v1/object/list/dream-images`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ prefix: `${userId}/`, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (listResponse.ok) {
    const objects = await listResponse.json() as Array<{ name?: string }>;
    const paths = objects.map(item => item.name).filter((name): name is string => Boolean(name)).map(name => name.startsWith(`${userId}/`) ? name : `${userId}/${name}`);
    if (paths.length) {
      const deleteStorage = await fetch(`${supabaseUrl}/storage/v1/object/dream-images`, {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!deleteStorage.ok) throw new Error(`Could not delete private dream images (${deleteStorage.status})`);
    }
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) throw new Error(`Account deletion failed (${response.status}): ${await response.text()}`);
}
