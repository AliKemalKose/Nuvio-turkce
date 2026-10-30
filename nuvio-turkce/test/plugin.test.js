'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const js = fs.readFileSync(path.join(__dirname, '../plugin/providers/turkce-kaynak.js'), 'utf8');

test('native plugin returns safely when unconfigured', async () => {
  const ctx = {Promise, console, globalThis: {}};
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const streams = await ctx.globalThis.getStreams('12', 'movie');
  assert.equal(streams.length, 0);
});
test('native plugin fetches configured authorized sources', async () => {
  const ctx = {Promise, console, globalThis: {}, fetch: async url => {
    assert.match(url, /\/api\/streams\?type=tv&tmdbId=34&season=1&episode=1/);
    return {ok: true, json: async () => ({streams: [{url: 'https://example.com/part.m3u8', quality: '720p', name: 'Test'}]})};
  }};
  vm.createContext(ctx);
  vm.runInContext(js.replace('https://SUNUCUNUZ.example.com', 'https://myserver.example.org'), ctx);
  const streams = await ctx.globalThis.getStreams('34', 'tv', 1, 1);
  assert.equal(streams[0].quality, '720p');
});
