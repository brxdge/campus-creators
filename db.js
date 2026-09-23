/* Simple JSON-backed store.
   Deliberately dependency-free: no native modules, so `npm install` never
   needs a C++ compiler and this runs on any Node version or host.
   The dataset here is small (brands + media filenames), so the whole thing
   is held in memory and flushed to disk atomically on every change. */

const path = require('path');
const fs = require('fs');

// DATA_DIR is where the JSON file lives. On Railway point this at a mounted
// volume (e.g. /data) so it survives redeploys. If only UPLOAD_DIR is set
// (e.g. /data/uploads), its parent folder is used, so content.json always
// sits on the same volume as the uploads, roster.json and submissions.json.
const DATA_DIR = process.env.DATA_DIR ||
  (process.env.UPLOAD_DIR ? path.dirname(process.env.UPLOAD_DIR) : path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'content.json');

const SEED_BRANDS = [
  'HelloFresh', 'Carlsberg', 'Dirty Devil Vodka', 'Crank Lite Lager',
  'Little Buddha Cocktail Co.', 'XLIV Loungewear', 'Bet99 Sportsbook', 'Reign Energy',
];

function emptyState() {
  return {
    nextBrandId: 1,
    nextMediaId: 1,
    brands: [],   // { id, name, sort_order, created_at }
    media: [],    // { id, brand_id, kind, filename, poster, original, bytes, sort_order, created_at }
  };
}

let state;

function load() {
  try {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // guard against a truncated or hand-edited file
    if (!state || !Array.isArray(state.brands) || !Array.isArray(state.media)) {
      throw new Error('malformed');
    }
  } catch (e) {
    state = emptyState();
    SEED_BRANDS.forEach((name) => {
      state.brands.push({
        id: state.nextBrandId++,
        name,
        sort_order: state.brands.length,
        created_at: new Date().toISOString(),
      });
    });
    save();
  }
}

function save() {
  // write to a temp file then rename, so a crash mid-write can't corrupt the store
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

load();

module.exports = {
  listBrands() {
    return [...state.brands].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
  },

  addBrand(name) {
    const exists = state.brands.some(
      (b) => b.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      const err = new Error('That brand already exists.');
      err.code = 'DUPLICATE';
      throw err;
    }
    const brand = {
      id: state.nextBrandId++,
      name,
      sort_order: state.brands.length,
      created_at: new Date().toISOString(),
    };
    state.brands.push(brand);
    save();
    return brand;
  },

  deleteBrand(id) {
    state.brands = state.brands.filter((b) => b.id !== id);
    state.media = state.media.filter((m) => m.brand_id !== id);
    save();
  },

  listMedia(brandId) {
    return state.media
      .filter((m) => m.brand_id === brandId)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  },

  addMedia({ brandId, kind, filename, poster, original, bytes }) {
    const siblings = this.listMedia(brandId);
    const item = {
      id: state.nextMediaId++,
      brand_id: brandId,
      kind,
      filename,
      poster: poster || null,
      original: original || null,
      bytes: bytes || 0,
      sort_order: siblings.length,
      created_at: new Date().toISOString(),
    };
    state.media.push(item);
    save();
    return item;
  },

  getMedia(id) {
    return state.media.find((m) => m.id === id) || null;
  },

  deleteMedia(id) {
    state.media = state.media.filter((m) => m.id !== id);
    save();
  },

  // everything the public site needs, in one shape
  publicMediaMap() {
    const out = {};
    for (const b of this.listBrands()) {
      const rows = this.listMedia(b.id);
      out[b.name] = {
        photos: rows.filter((r) => r.kind === 'photo').map((r) => r.filename),
        videos: rows.filter((r) => r.kind === 'video').map((r) => ({
          src: r.filename,
          poster: r.poster || undefined,
        })),
      };
    }
    return out;
  },
};