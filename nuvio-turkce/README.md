# Nuvio Türkçe Keşif — Film ve Dizi Eklentisi

Nuvio için hazırlanmış, **sunucuda çalışan Stremio uyumlu katalog eklentisi** ve isteğe bağlı **Nuvio oynatma sağlayıcısı**.

> **Durum:** Başlangıç projesidir; yerel testleri tamamlandı. TMDB anahtarı ve yayınlanmış HTTPS sunucusu olmadan kataloglar gerçek verileri getiremez. Uygulama üzerinde canlı Nuvio kurulumu henüz doğrulanmadı. **Eklenti kendi başına telifli film ve dizileri oynatmaz.** Oynatma bağlantıları yalnızca sizin `data/streams.json` dosyasına eklediğiniz erişim izni bulunan yayınlardan gelir.

## Ne yapar?

- **Yerli Filmler** ve **Yerli Diziler**: TMDB'nin `original_language=tr` verisine göre keşif.
- **Türkiye'deki Platformlarda Filmler/Diziler**: TMDB'nin Türkiye bölgesinde abonelikle izlenebilir olarak işaretlediği yapımların keşfi; bu veri güncel katalog durumuna ve platformun doğruluğuna bağlıdır.
- **Türkçe başlık, açıklama, görsel ve dizi bölüm bilgileri**: TMDB'nin Türkçe yerelleştirmesini kullanır.
- **Arama**: Katalog içinden yapım adı arama.
- **Yayın bağlantıları**: Kendi yasal/izinli `.mp4`, `.m3u8`, `.mkv` URL'lerinizi isteğe bağlı olarak ekleme.
- **Türkçe altyazı**: Sahip olduğunuz `.srt` veya `.vtt` dosyalarının bağlantıları tanımlanabilir.

**Önemli ayrım:** TMDB, bir yapımın gerçekten Türkçe *dublaj* veya *altyazı* taşıdığını garanti eden bir veri kaynağı değildir. Dil/altyazı bilgisini yalnızca kendi tanımladığınız yayında kesin gösteriyoruz. Platformların DRM'lerini aşma veya üçüncü taraflardan izinsiz akış çekme işlevi yoktur.

## Gereksinimler

- Node.js **20+**
- [The Movie Database (TMDB) API anahtarı](https://www.themoviedb.org/settings/api)
- Nuvio'ya dışarıdan kurmak için erişilebilir **HTTPS web sunucusu** (Node uygulamasını barındıran bir sunucu veya Node destekleyen dağıtım hizmeti)

## 1. Bilgisayarınızda çalıştırma

Terminalde bu klasöre girin:

```bash
cp .env.example .env
```

`.env` içindeki `TMDB_API_KEY=...` satırını kendi anahtarınızla değiştirin.

```bash
node --env-file=.env server.js
```

Şunları açın:

- Ana sayfa: `http://localhost:7000/`
- Manifest: `http://localhost:7000/manifest.json`
- Film kataloğu: `http://localhost:7000/catalog/movie/yerli-filmler.json`
- Dizi kataloğu: `http://localhost:7000/catalog/series/yerli-diziler.json`
- Arama: `http://localhost:7000/catalog/movie/yerli-filmler/search=arama.json`

Testler:

```bash
npm test
```

**Windows:** `.env.example` dosyasını `.env` olarak kopyalayıp aynı `node --env-file=.env server.js` komutunu kullanın.

## 2. Nuvio'ya addon olarak kurma (katalog için önerilen)

1. Node.js sunucusunu bir HTTPS alan adında yayınlayın. **Yalnızca GitHub'a kod yüklemek yeterli değildir; katalog dinamik olarak TMDB'ye bağlanır.**
2. Eklentinin açık manifest adresini test edin: `https://alan-adiniz.example/manifest.json`.
3. Nuvio'da **Ayarlar > Addons/Eklentiler > Add Addon** yolunu açın (sürüme göre ad değişebilir).
4. Bu manifest URL'sini ekleyin.
5. Keşif ekranındaki *Yerli Filmler* ve *Yerli Diziler* kataloglarını açın.

## 3. Yayın bağlantılarını ekleme (isteğe bağlı)

`data/streams.example.json` dosyasını örnek alın ve `data/streams.json` dosyasını düzenleyin. Sözlük anahtarları:

- `movie:123`: TMDB film ID `123`
- `tv:456:1:1`: TMDB dizi ID `456`, 1. sezon, 1. bölüm

Örnek kayıt:

```json
{
  "movie:123": [{
    "name": "Kişisel Arşiv",
    "url": "https://media.example.com/izinli-film.mp4",
    "quality": "1080p",
    "language": "tr",
    "audio": "dublaj",
    "note": "Türkçe Dublaj",
    "subtitles": [{"url": "https://media.example.com/film-tr.vtt", "lang": "tur", "label": "Türkçe"}]
  }]
}
```

Bu adresler **sadece biçimi göstermek içindir**, gerçek yayın URL'si değildir. Kendi izinli URL'lerinizi kullanın. Sunucuyu yeniden başlatınca JSON değişikliği yüklenir. Gizli token, çerez veya kişisel dosya adreslerini erişimi açık projeye eklemeyin; bu örnek sunucuda kimlik doğrulaması yoktur.

## 4. Nuvio Plugin olarak kurma (yalnızca stream için)

Nuvio'nun kendi plugin sistemi *stream arar*, katalog üretmez. Yukarıdaki addon zaten kendi katalogları için stream sunabildiği için **ikisini birlikte kurmak zorunda değilsiniz**. Ancak Nuvio'nun diğer yapımlarının TMDB kimlikleri üzerinden kendi yayın URL'lerinizi göstermek istiyorsanız şu yapıyı kullanın:

1. `plugin/providers/turkce-kaynak.js` içindeki `API_BASE_URL` değerini gerçek sunucunuza (`https://alan-adiniz.example`) çevirin.
2. `plugin/` klasöründeki `manifest.json` ve `providers/` dosyalarını GitHub deposunun **köküne** yerleştirin.
3. Nuvio > Ayarlar > Content & Discovery > Plugins > Add Repository bölümüne şu biçimdeki gerçek manifest URL'sini girin:

   `https://raw.githubusercontent.com/KULLANICI/DEPO/main/manifest.json`

4. `Turkce Kisisel Kaynak` sağlayıcısını etkinleştirin.

Plugin, sunucunuzdaki `/api/streams?type=movie&tmdbId=123` API'sini kullanır. Bütün bağlantıları kendiliğinden internette aramaz; yalnızca sizin tanımladığınız erişim izni bulunan kaynakları gösterir.

## Dosyalar

```text
nuvio-turkce/
├── server.js                 # Stremio uyumlu katalog, metadata, stream ve altyazı API'si
├── data/
│   ├── streams.json         # Gerçek kaynaklarınız (başlangıçta boş)
│   └── streams.example.json # Veri biçimi örneği
├── plugin/
│   ├── manifest.json        # Nuvio native plugin deposu manifesti
│   └── providers/
│       └── turkce-kaynak.js  # Nuvio getStreams sağlayıcısı
├── test/                    # Yerel testler
├── .env.example
├── Dockerfile
└── package.json
```

## Notlar

- Testler canlı TMDB, gerçek yayın sunucuları veya Nuvio uygulaması üzerinden değil, yerel sahte yanıtlar üzerinden çalıştırılmıştır.
- Arama, Türkiye'deki platform görünürlüğü ve katalog içerikleri TMDB API'si ile güncel hale gelir; TMDB anahtarınız olmadan liste çalışmaz.
- Bu ürün TMDB API'sini kullanır ancak TMDB tarafından desteklenmez veya onaylanmaz.
- Nuvio marka/ürünüyle resmi bağlantısı olmayan kişisel geliştirici örneğidir.
