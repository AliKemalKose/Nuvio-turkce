'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const http = require('node:http');
const {createHandler, parseId} = require('../server');

async function get(pathname, options = {}) {
  const requests = [];
  const fetcher = async url => {
    requests.push(url);
    const uri = new URL(url);
    let payload = {results: [{id: 12, title: 'Test Türkçe Film', original_language: 'tr', poster_path: '/poster.jpg', vote_average: 8.3}]};
    if (uri.pathname.includes('/movie/12')) payload = {id: 12, title: 'Test Türkçe Film', original_language: 'tr', poster_path: '/poster.jpg', genres: [{name: 'Dram'}]};
    if (uri.pathname.includes('/tv/34/season/1')) payload = {episodes: [{episode_number: 1, name: 'Pilot'}]};
    if (uri.pathname.includes('/tv/34') && !uri.pathname.includes('/season')) payload = {id: 34, name: 'Test Dizi', seasons: [{season_number: 1, episode_count: 1}], poster_path: '/x.jpg'};
    return {ok: true, json: async () => payload};
  };
  const server = http.createServer(createHandler({apiKey: options.apiKey || 'test-key', fetcher, streams: options.streams || {}}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + pathname);
    return {status: response.status, data: await response.json(), requests};
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('manifest Stremio uyumlu ve kataloglar var', async () => {
  const r = await get('/manifest.json');
  assert.equal(r.status, 200);
  assert.ok(r.data.resources.includes('catalog'));
  assert.ok(r.data.catalogs.some(c => c.id === 'yerli-diziler'));
});
test('yerli filmler TR filtresi kullanir', async () => {
  const r = await get('/catalog/movie/yerli-filmler.json');
  assert.equal(r.data.metas[0].id, 'trtmdb:movie:12');
  assert.ok(r.requests[0].includes('with_original_language=tr'));
});
test('Turkiye katalogunda platform filtresi kullanir', async () => {
  const r = await get('/catalog/series/turkiyede-diziler.json');
  assert.equal(r.status, 200);
  assert.ok(r.requests[0].includes('watch_region=TR'));
});
test('arama katalog endpointi', async () => {
  const r = await get('/catalog/movie/yerli-filmler/search=deneme.json');
  assert.equal(r.status, 200);
  assert.ok(r.requests[0].includes('/search/movie?'));
});
test('dizi sezona ait bolum listesini dondurur', async () => {
  const r = await get('/meta/series/trtmdb:tv:34.json');
  assert.equal(r.status, 200);
  assert.equal(r.data.meta.videos[0].id, 'trtmdb:tv:34:1:1');
});
test('yalnizca izinli tanimli video kaynaklari doner', async () => {
  const streams = {'tv:34:1:1': [{name: 'Arsiv', url: 'https://example.com/bolum.mp4', quality: '1080p', language: 'tr'}, {url: 'javascript:alert(1)'}]};
  const r = await get('/stream/series/trtmdb:tv:34:1:1.json', {streams});
  assert.equal(r.data.streams.length, 1);
  assert.equal(r.data.streams[0].url, 'https://example.com/bolum.mp4');
});
test('plugin API sorularina stream listesi doner', async () => {
  const streams = {'movie:12': [{url: 'https://example.com/movie.m3u8', note: 'Turkce Altyazi'}]};
  const r = await get('/api/streams?type=movie&tmdbId=12', {streams});
  assert.equal(r.status, 200);
  assert.equal(r.data.streams.length, 1);
});
test('hatali url uygun yanit verir', async () => {
  const r = await get('/api/streams?type=tv&tmdbId=invalid');
  assert.equal(r.status, 400);
  assert.equal(parseId('trtmdb:tv:34:1:1').episode, 1);
});

test('alt yazi kaynagi ayrı endpoint ile sunulur', async () => {
  const streams = {'movie:12': [{url: 'https://example.com/film.mp4', subtitles: [{url: 'https://example.com/tr.vtt', lang: 'tur'}]}]};
  const r = await get('/subtitles/movie/trtmdb:movie:12.json', {streams});
  assert.equal(r.status, 200);
  assert.equal(r.data.subtitles[0].lang, 'tur');
});
