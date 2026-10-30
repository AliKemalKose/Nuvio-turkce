'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CATALOGS = [
  {type: 'movie', id: 'yerli-filmler', name: 'Yerli Filmler', extra: [{name: 'search', isRequired: false}, {name: 'skip', isRequired: false}]},
  {type: 'series', id: 'yerli-diziler', name: 'Yerli Diziler', extra: [{name: 'search', isRequired: false}, {name: 'skip', isRequired: false}]},
  {type: 'movie', id: 'turkiyede-filmler', name: "Türkiye'de Platformlarda", extra: [{name: 'search', isRequired: false}, {name: 'skip', isRequired: false}]},
  {type: 'series', id: 'turkiyede-diziler', name: "Türkiye'de Platformlarda Diziler", extra: [{name: 'search', isRequired: false}, {name: 'skip', isRequired: false}]}
];

const MANIFEST = {
  id: 'com.nuvio.turkce.kesif',
  version: '1.0.0',
  name: 'Nuvio Türkçe Keşif',
  description: "Yerli film/dizi katalogları, Türkçe başlıklar, Türkiye'deki platformlarda listelenen yapımlar ve izinli kişisel yayın kaynakları.",
  resources: ['catalog', 'meta', 'stream', 'subtitles'],
  types: ['movie', 'series'],
  idPrefixes: ['trtmdb:'],
  catalogs: CATALOGS,
  behaviorHints: {configurable: false}
};

function contentId(type, id) {
  return 'trtmdb:' + (type === 'movie' ? 'movie' : 'tv') + ':' + id;
}
function parseId(id) {
  const m = /^trtmdb:(movie|tv):(\d+)(?::(\d+):(\d+))?$/.exec(id || '');
  if (!m) return null;
  return {type: m[1] === 'tv' ? 'series' : 'movie', tmdbId: m[2], season: m[3] ? +m[3] : null, episode: m[4] ? +m[4] : null};
}
function responseJSON(res, status, obj) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300'});
  res.end(JSON.stringify(obj));
}
function mapPreview(type, x) {
  return {
    id: contentId(type, x.id),
    type,
    name: x.title || x.name || x.original_title || x.original_name || 'Başlıksız',
    poster: x.poster_path ? 'https://image.tmdb.org/t/p/w500' + x.poster_path : undefined,
    posterShape: 'poster',
    background: x.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + x.backdrop_path : undefined,
    description: x.overview || '',
    releaseInfo: (x.release_date || x.first_air_date || '').slice(0, 4),
    imdbRating: x.vote_average ? x.vote_average.toFixed(1) : undefined
  };
}
function safeSources(streams, type, tmdbId, season, episode) {
  const key = type === 'movie' ? 'movie:' + tmdbId : 'tv:' + tmdbId + ':' + season + ':' + episode;
  const entries = Array.isArray(streams[key]) ? streams[key] : [];
  const seen = new Set();
  return entries.filter(entry => {
    if (!entry || typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) return false;
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  }).map(entry => ({
    name: entry.name || 'Kişisel Arşiv',
    title: [entry.note || (entry.audio === 'dublaj' ? 'Türkçe Dublaj' : entry.subtitles && entry.subtitles.length ? 'Türkçe Altyazı' : entry.language === 'tr' ? 'Türkçe' : 'Dil belirtilmedi'), entry.quality || 'HD'].join(' • '),
    url: entry.url,
    subtitles: Array.isArray(entry.subtitles) ? entry.subtitles.filter(s => s && /^https?:\/\//.test(s.url || '')).map(s => ({url: s.url, lang: s.lang || 'tur', label: s.label || 'Türkçe'})) : [],
    quality: entry.quality || 'HD',
    headers: entry.headers && typeof entry.headers === 'object' ? entry.headers : {}
  }));
}
function toStremioStream(x) {
  const y = {name: x.name, title: x.title, url: x.url};
  if (Object.keys(x.headers).length) y.behaviorHints = {proxyHeaders: {request: x.headers}};
  return y;
}

function createHandler({apiKey = '', fetcher = globalThis.fetch, streams = {}} = {}) {
  const cache = new Map();
  async function tmdb(endpoint, params = {}) {
    if (!apiKey || /BURAYA_API_ANAHTARI/.test(apiKey)) {
      const error = new Error('TMDB_API_KEY tanımlanmamış. README.md dosyasına bakın.');
      error.code = 503;
      throw error;
    }
    const query = new URLSearchParams({api_key: apiKey, language: 'tr-TR', ...params});
    const url = 'https://api.themoviedb.org/3' + endpoint + '?' + query;
    const now = Date.now();
    const cached = cache.get(url);
    if (cached && now - cached.time < 300000) return cached.value;
    const r = await fetcher(url, {headers: {accept: 'application/json'}});
    if (!r.ok) {
      const error = new Error('TMDB yanıtı: HTTP ' + r.status);
      error.code = r.status === 429 ? 503 : 502;
      throw error;
    }
    const value = await r.json();
    if (cache.size > 250) cache.clear();
    cache.set(url, {time: now, value});
    return value;
  }

  async function catalog(type, id, extra) {
    const spec = CATALOGS.find(c => c.type === type && c.id === id);
    if (!spec) return null;
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const search = (extra.search || '').trim().slice(0, 120);
    const skip = Math.min(380, Math.max(0, Number(extra.skip) || 0));
    const page = Math.floor(skip / 20) + 1;
    let data;
    if (search) {
      data = await tmdb('/search/' + tmdbType, {query: search, page: String(page), include_adult: 'false'});
    } else {
      const query = {sort_by: 'popularity.desc', page: String(page), include_adult: 'false'};
      if (id.startsWith('yerli-')) query.with_original_language = 'tr';
      else {
        query.watch_region = 'TR';
        query.with_watch_monetization_types = 'flatrate';
      }
      data = await tmdb('/discover/' + tmdbType, query);
    }
    let results = (data.results || []).filter(x => x && x.id && x.poster_path);
    if (search && id.startsWith('yerli-')) results = results.filter(x => x.original_language === 'tr');
    // 'Turkiye'de platformlarda' sadece katalog bilgisidir; Turkce dublaj garantisi degildir.
    return results.map(x => mapPreview(type, x));
  }

  async function meta(type, id) {
    const parsed = parseId(id);
    if (!parsed || parsed.type !== type) return null;
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const details = await tmdb('/' + tmdbType + '/' + parsed.tmdbId);
    const result = mapPreview(type, details);
    result.genres = (details.genres || []).map(g => g.name);
    result.runtime = type === 'movie' ? (details.runtime ? details.runtime + ' dk' : undefined) : undefined;
    if (type === 'series') {
      const seasons = (details.seasons || []).filter(x => x.season_number > 0 && x.episode_count > 0).slice(0, 20);
      const batches = await Promise.all(seasons.map(s => tmdb('/tv/' + parsed.tmdbId + '/season/' + s.season_number).catch(() => ({episodes: []}))));
      result.videos = batches.flatMap((batch, index) => (batch.episodes || []).filter(x => x.episode_number > 0).map(x => ({
        id: contentId('series', parsed.tmdbId) + ':' + seasons[index].season_number + ':' + x.episode_number,
        title: x.name || (x.episode_number + '. Bölüm'),
        season: seasons[index].season_number,
        episode: x.episode_number,
        released: x.air_date || undefined,
        overview: x.overview || '',
        thumbnail: x.still_path ? 'https://image.tmdb.org/t/p/w500' + x.still_path : undefined
      })));
    }
    return result;
  }

  function fromParts(route) {
    // Stremio: /catalog/movie/catalog-id.json veya
    //          /catalog/movie/catalog-id/search=arama&skip=20.json
    if (route.length < 3 || route.length > 4) return null;
    const hasExtra = route.length === 4;
    const last = hasExtra ? route[3] : route[2];
    if (!last.endsWith('.json')) return null;
    const id = hasExtra ? route[2] : route[2].slice(0, -5);
    const extra = {};
    if (hasExtra) {
      const extraText = route[3].slice(0, -5);
      for (const item of extraText.split('&')) {
        const pos = item.indexOf('=');
        if (pos > 0) extra[decodeURIComponent(item.slice(0, pos))] = decodeURIComponent(item.slice(pos + 1));
      }
    }
    return {id, extra};
  }

  return async (req, res) => {
    if (req.method !== 'GET') return responseJSON(res, 405, {error: 'Yalnızca GET destekleniyor'});
    try {
      const u = new URL(req.url, 'http://localhost');
      const route = u.pathname.split('/').filter(Boolean);
      if (u.pathname === '/manifest.json') return responseJSON(res, 200, MANIFEST);
      if (u.pathname === '/health') return responseJSON(res, 200, {ok: true, tmdbConfigured: Boolean(apiKey)});
      if (u.pathname === '/api/streams') {
        const type = u.searchParams.get('type');
        const tmdbId = u.searchParams.get('tmdbId');
        const season = u.searchParams.get('season');
        const episode = u.searchParams.get('episode');
        if (!['movie','tv'].includes(type) || !/^\d+$/.test(tmdbId || '') ||
            (type === 'tv' && (!/^\d+$/.test(season || '') || !/^\d+$/.test(episode || '')))) {
          return responseJSON(res, 400, {error: 'Geçersiz type, tmdbId, season veya episode'});
        }
        return responseJSON(res, 200, {streams: safeSources(streams, type, tmdbId, season, episode)});
      }
      if (route[0] === 'catalog' && ['movie', 'series'].includes(route[1])) {
        const args = fromParts(route);
        if (!args) return responseJSON(res, 404, {metas: []});
        const metas = await catalog(route[1], args.id, args.extra);
        return responseJSON(res, metas === null ? 404 : 200, {metas: metas || []});
      }
      if (route[0] === 'meta' && ['movie', 'series'].includes(route[1]) && route.length === 3) {
        const id = route[2].endsWith('.json') ? route[2].slice(0, -5) : '';
        const data = await meta(route[1], id);
        return responseJSON(res, data ? 200 : 404, {meta: data});
      }
      if (route[0] === 'subtitles' && ['movie', 'series'].includes(route[1]) && route.length === 3) {
        const id = route[2].endsWith('.json') ? route[2].slice(0, -5) : '';
        const p = parseId(id);
        const s = p && p.type === route[1] ? safeSources(streams, p.type === 'movie' ? 'movie' : 'tv', p.tmdbId, p.season, p.episode) : [];
        const subtitles = [];
        s.forEach((item, index) => item.subtitles.forEach((sub, index2) => subtitles.push({id: 'tr-' + index + '-' + index2, url: sub.url, lang: sub.lang, label: sub.label})));
        return responseJSON(res, 200, {subtitles});
      }
      if (route[0] === 'stream' && ['movie', 'series'].includes(route[1]) && route.length === 3) {
        const id = route[2].endsWith('.json') ? route[2].slice(0, -5) : '';
        const p = parseId(id);
        const s = p && p.type === route[1] ? safeSources(streams, p.type === 'movie' ? 'movie' : 'tv', p.tmdbId, p.season, p.episode) : [];
        return responseJSON(res, 200, {streams: s.map(toStremioStream)});
      }
      if (u.pathname === '/') {
        res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
        return res.end('<!doctype html><meta charset="utf-8"><title>Nuvio Türkçe Keşif</title><h1>Nuvio Türkçe Keşif</h1><p>Stremio/Nuvio addon manifest: <a href="/manifest.json">/manifest.json</a></p><p>TMDB anahtarını tanımlayarak yerli film ve dizi kataloglarını etkinleştirin.</p>');
      }
      responseJSON(res, 404, {error: 'Bulunamadı'});
    } catch (err) {
      const code = err.code === 503 || err.code === 502 ? err.code : 500;
      console.error('[Nuvio Türkçe]', err.message);
      responseJSON(res, code, {error: err.message});
    }
  };
}

function loadStreams() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'streams.json'), 'utf8')); }
  catch (err) { console.error('streams.json okunamıyor:', err.message); return {}; }
}
if (require.main === module) {
  // .env yüklemek için bağımlılık yok: Node 20+ "node --env-file=.env server.js" ya da dış ortam değişkeni kullanın.
  const port = Number(process.env.PORT) || 7000;
  http.createServer(createHandler({apiKey: process.env.TMDB_API_KEY, streams: loadStreams()}))
    .listen(port, '0.0.0.0', () => console.log('Nuvio Türkçe Keşif: http://localhost:' + port + '/manifest.json'));
}
module.exports = {createHandler, parseId, safeSources, mapPreview, MANIFEST};
