import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parquetReadObjects, parquetMetadataAsync, asyncBufferFromFile } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

export const root = resolve(import.meta.dirname, '../..');
export const sourcePaths = {
  map: resolve(root, '04_final_figure_package_v2_editorial/source_tables/final_map_source_2018.parquet'),
  registry: resolve(root, 'phase10_final_scientific_package/07_DIAGNOSTICS/phase9g_georeferenced_grid/spatial_registry_georeferenced_1km.parquet'),
  status: resolve(root, 'phase11_enhanced_reanalysis/08_final_maps/PHASE11I_B_STATUS.json'),
};
export async function readParquet(path) {
  return parquetReadObjects({ file: await asyncBufferFromFile(path), compressors });
}
if (process.argv[1] === new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1').replaceAll('/', '\\') || process.argv[1]?.endsWith('inspect.mjs')) {
  await mkdir(resolve(import.meta.dirname, '../reports'), { recursive: true });
  const out = {};
  for (const [key, path] of Object.entries(sourcePaths)) {
    if (key === 'status') { out.status = JSON.parse(await readFile(path, 'utf8')); continue; }
    const meta = await parquetMetadataAsync(await asyncBufferFromFile(path));
    const rows = await readParquet(path);
    out[key] = { count: rows.length, metadata: meta.key_value_metadata, schema: meta.schema, sample: rows.slice(0, 3), fields: {} };
    for (const field of Object.keys(rows[0])) {
      let missing = 0, min = Infinity, max = -Infinity;
      const values = new Set(); const types = new Set();
      for (const row of rows) {
        const v = row[field];
        if (v == null || (typeof v === 'number' && !Number.isFinite(v))) { missing++; continue; }
        types.add(typeof v); values.add(v);
        if (typeof v === 'number' || typeof v === 'bigint') { min = Math.min(min, Number(v)); max = Math.max(max, Number(v)); }
      }
      out[key].fields[field] = { types: [...types], missing, unique: values.size, min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null, values: values.size < 40 ? [...values] : undefined };
    }
  }
  const json = JSON.stringify(out, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2);
  await writeFile(resolve(import.meta.dirname, '../reports/source-inspection.json'), json);
  console.log(json);
}
