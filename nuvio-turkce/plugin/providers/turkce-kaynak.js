// Nuvio plugin tarafinda calisir. GitHub'a yayimlamadan once API_BASE_URL duzenleyin.
// Katalog kesfi icin ust klasordeki Stremio uyumlu addon'u ayri olarak kurun.
var API_BASE_URL = 'https://SUNUCUNUZ.example.com';

function getStreams(tmdbId, mediaType, season, episode) {
  if (!/^(movie|tv)$/.test(String(mediaType))) return Promise.resolve([]);
  var id = String(tmdbId || '').replace(/^tmdb:/, '').split(':')[0];
  if (!/^\d+$/.test(id)) return Promise.resolve([]);
  if (/SUNUCUNUZ\.example\.com/.test(API_BASE_URL)) {
    console.log('[Nuvio Turkce] Sunucu adresi ayarlanmamis');
    return Promise.resolve([]);
  }
  var url = API_BASE_URL.replace(/\/$/, '') + '/api/streams?type=' +
    encodeURIComponent(mediaType) + '&tmdbId=' + encodeURIComponent(id);
  if (mediaType === 'tv') {
    if (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode))) return Promise.resolve([]);
    url += '&season=' + encodeURIComponent(season) + '&episode=' + encodeURIComponent(episode);
  }
  return fetch(url).then(function(res) {
    if (!res.ok) throw new Error('Kaynak API HTTP ' + res.status);
    return res.json();
  }).then(function(data) {
    if (!data || !Array.isArray(data.streams)) return [];
    return data.streams.filter(function(s) {
      return s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url);
    }).map(function(s) {
      return {
        name: s.name || 'Turkce Kaynak',
        title: s.title || 'Turkce Yayın',
        url: s.url,
        quality: s.quality || 'HD',
        headers: s.headers || {},
        subtitles: Array.isArray(s.subtitles) ? s.subtitles.map(function(sub) {
          return {url: sub.url, language: sub.lang || 'tur', label: sub.label || 'Türkçe'};
        }) : []
      };
    });
  }).catch(function(err) {
    console.log('[Nuvio Turkce] ' + (err && err.message || err));
    return [];
  });
}
if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
if (typeof module !== 'undefined' && module.exports) module.exports = {getStreams: getStreams};
