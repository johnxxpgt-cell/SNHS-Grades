import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before running this migration.");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const bucket = "profile-photos";
const pageSize = 500;
let migrated = 0;
let clearedLegacyCopies = 0;

for (const { table, folder } of [
  { table: "teacher_profiles", folder: "teachers" },
  { table: "students", folder: "students" }
]) {
  let offset = 0;
  while (true) {
    const { data: rows, error: queryError } = await supabase
      .from(table)
      .select("id, avatar_path, avatar_webp_data_url")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (queryError) throw new Error(`Could not read ${table}: ${queryError.message}`);
    if (!rows?.length) break;

    for (const row of rows) {
      if (!row.avatar_webp_data_url) continue;
      let path = row.avatar_path;
      if (!path) {
        const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(row.avatar_webp_data_url);
        if (!match) throw new Error(`Legacy photo on ${table} record ${row.id} is not a valid WebP data URL.`);
        const bytes = Buffer.from(match[1], "base64");
        if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
          throw new Error(`Legacy photo on ${table} record ${row.id} is not a valid WebP file.`);
        }
        path = `${folder}/${row.id}/legacy-${row.id}.webp`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: true
        });
        if (uploadError) throw new Error(`Could not upload photo for ${table} record ${row.id}: ${uploadError.message}`);
      }

      const { error: verifyError } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (verifyError) throw new Error(`Could not verify the stored photo for ${table} record ${row.id}: ${verifyError.message}`);

      const { error: updateError } = await supabase
        .from(table)
        .update({ avatar_path: path, avatar_webp_data_url: null })
        .eq("id", row.id);
      if (updateError) throw new Error(`Could not update ${table} record ${row.id}: ${updateError.message}`);
      if (row.avatar_path) clearedLegacyCopies += 1;
      else migrated += 1;
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }
}

console.log(`Migrated ${migrated} legacy photo(s) to private WebP storage.`);
console.log(`Cleared ${clearedLegacyCopies} legacy data URL copy/copies from records already using a storage path.`);
