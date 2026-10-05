/**
 * One-time backfill: creates the small (400px) thumbnail for every profile
 * photo uploaded before thumbnails existed. New uploads create their own
 * thumbnail in the app (src/utils/photoThumbnails.ts), so this only needs to
 * run once. Safe to re-run: photos that already have a thumbnail are skipped.
 *
 * Thumbnails live next to each photo:  <userId>/<name>  ->  <userId>/thumbs/<name>
 *
 * Needs the service-role key (to write into every user's folder). It is read
 * from the environment only - never commit it.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-photo-thumbnails.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-photo-thumbnails.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'user-photos';
const MAX = 400;
const CONCURRENCY = 6;
const dryRun = process.argv.includes('--dry-run');

function readSupabaseUrl() {
  const clientPath = path.join(process.cwd(), 'src', 'integrations', 'supabase', 'client.ts');
  const content = fs.readFileSync(clientPath, 'utf8');
  return content.match(/export\s+const\s+SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
}

const url = process.env.SUPABASE_URL || readSupabaseUrl();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (and optionally SUPABASE_URL) in the environment.');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const marker = `/storage/v1/object/public/${BUCKET}/`;
const pathFromUrl = (u) => {
  const raw = u.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/').split('?')[0];
  const at = raw.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(raw.slice(at + marker.length));
};
const thumbPathFor = (p) => {
  const slash = p.lastIndexOf('/');
  return slash <= 0 ? null : `${p.slice(0, slash)}/thumbs/${p.slice(slash + 1)}`;
};

async function fetchAllImageUrls() {
  const urls = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('user_images')
      .select('image_url')
      .gte('image_order', 1)
      .range(from, from + page - 1);
    if (error) throw error;
    urls.push(...data.map((r) => r.image_url).filter(Boolean));
    if (data.length < page) break;
  }
  return [...new Set(urls)];
}

async function thumbnailExists(thumbPath) {
  const dir = thumbPath.slice(0, thumbPath.lastIndexOf('/'));
  const name = thumbPath.slice(thumbPath.lastIndexOf('/') + 1);
  const { data } = await supabase.storage.from(BUCKET).list(dir, { search: name, limit: 1 });
  return Boolean(data?.some((f) => f.name === name));
}

async function processOne(photoUrl) {
  const photoPath = pathFromUrl(photoUrl);
  const thumbPath = photoPath && thumbPathFor(photoPath);
  if (!thumbPath) return 'skipped';
  if (await thumbnailExists(thumbPath)) return 'exists';
  if (dryRun) return 'would-create';

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(photoPath);
  if (error || !blob) return 'missing-photo';
  const input = Buffer.from(await blob.arrayBuffer());
  const thumb = await sharp(input)
    .rotate() // respect EXIF orientation
    .resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(thumbPath, thumb, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
  if (upErr) throw upErr;
  return 'created';
}

const urls = await fetchAllImageUrls();
console.log(`${urls.length} photos to check${dryRun ? ' (dry run)' : ''}`);
const counts = {};
let done = 0;
const queue = [...urls];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const u = queue.shift();
      let result;
      try {
        result = await processOne(u);
      } catch (e) {
        result = 'failed';
        console.warn('Failed:', u, e.message || e);
      }
      counts[result] = (counts[result] || 0) + 1;
      if (++done % 50 === 0) console.log(`${done}/${urls.length}`, counts);
    }
  })
);
console.log('Done:', counts);
