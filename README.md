# PDS4NextMed · Proje Takip Portalı

Zafer Kalkınma Ajansı (PP5) ekibinin PDS4NextMed (Interreg NEXT MED) projesindeki görevlerini, Gantt planını,
günlük çalışmasını, somut çıktı hedeflerini ve mali kayıtlarını izlediği tam yığın (full‑stack) portal.

**Yığın:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · PostgreSQL 16 · Drizzle ORM · Tailwind CSS 4

## Kurulum

```bash
cp .env.example .env            # DATABASE_URL ve geçici parola
docker compose up -d db         # ya da kendi PostgreSQL 16 sunucunuz
npm install
npm run db:setup                # şema + data/seed.v3.json içe aktarımı + kullanıcı hesapları
npm run dev                     # http://localhost:3000
```

`npm run db:setup` tekrar çalıştırılabilir: içe aktarıcı kayıtları kalıcı kimlikle eşler, çoğaltma yapmaz ve portalda
düzenlenmiş alanları, gerçekleşmeleri, dosyaları ve başlangıç planlarını ezmez.

### İlk giriş

Kurulum her ekip üyesi için `ad.soyad@zafer.gov.tr` biçiminde bir hesap ve kişiye bağlı olmayan `admin@zafer.gov.tr`
hesabını oluşturur. Geçici parola `.env` içindeki `SEED_DEFAULT_PASSWORD` değeridir; ilk girişte değiştirilmesi istenir.
E‑posta adresleri ve yetkiler **Yönetim → Ekip ve Roller** ekranından düzenlenir.

| Sistem yetkisi | Varsayılan hesaplar |
| --- | --- |
| Admin | Erce ŞENGÜL, `admin@zafer.gov.tr` |
| Koordinasyon ve onay | Murat ŞENER, İsmail ÇAM |
| Mali yetkili | Erdem OKTAY, Mustafa DURMAZ |
| Ekip üyesi | diğerleri |

Proje başlangıç tarihi kurulumda **boştur**. Admin tarihi **Yönetim → Proje Ayarları** ekranından girer; 36 proje ayının
takvim karşılıkları bu tek tarihten hesaplanır ve ardından başlangıç planı (baseline) kaydedilir.

## Modüller

| Menü | Yol |
| --- | --- |
| Ana Sayfa — aylık hedef, onaylı süre, yaklaşan işler | `/app` |
| Takvim ve Gantt — genel / kişi bazlı, başlangıç · güncel · gerçekleşme | `/app/gantt` |
| Görevler | `/app/tasks` |
| Çalışmalarım — günlük kayıt, 30 dk adım, 8 saat sınırı, TR/EN kanıt | `/app/work` |
| Projenin Somut Çıktıları — 28 hedef | `/app/outputs` |
| Aylık Raporlama — kişi / iş paketi / genel; Word, Excel, PDF | `/app/reports` |
| Dokümanlar · Toplantılar · Hizmet Alımları · Seyahatler · Gelen Ödemeler | `/app/documents` … |
| İnceleme Kuyruğu | `/app/review` |
| Yönetim — panel, iş yükü, plan, ekip, ayarlar, maliyet, çeviri, veri yükleme, değişiklik kaydı | `/app/admin/*` |

## Mimari notlar

- **Proje ayı hesabı** `src/lib/dates.ts`: ay sınırları her zaman ilk başlangıç tarihine ay eklenerek bulunur
  (ayın günü yoksa son gün); aralıklı aylar ayrı pencereler olarak kalır; saatli personelin takvim ayı hedefleri
  örtüşen gün sayısına göre 0,01 saat hassasiyetle ve toplamı koruyan yuvarlamayla dağıtılır. Testler: `npm test`.
- **Sabit proje çatısı** (6 WP → 14 çıktı → 27 ana faaliyet) arayüzde ve sunucuda salt okunurdur; alt faaliyetler ve
  atamalar düzenlenir. Her revizyon kullanıcı, zaman, gerekçe ve önce/sonra değerleriyle `audit_log` tablosuna yazılır.
- **Günlük 8 saat sınırı** kişi+tarih için tek işlem içinde (advisory lock) denetlenir; veritabanında ayrıca
  `30 ≤ dakika ≤ 480` ve 30'un katı kısıtı vardır.
- **İki dil**: arayüz sözlükleri `src/i18n/dict/*`; kullanıcı metinleri `_tr` / `_en` sütunlarında saklanır. Kaynak dil
  metinden algılanır, karşı dil `translation_jobs` kuyruğuna alınır. `ANTHROPIC_API_KEY` tanımlıysa otomatik çevrilir,
  değilse **Yönetim → Çeviriler** ekranında elle girilip onaylanır.
- **Dosyalar** özgün halleriyle veritabanında (`files.data`) saklanır; indirme isteği her seferinde oturum ve erişim
  düzeyi (`team` / `finance` / `admin`) denetiminden geçer.
- **Yetkiler** `src/lib/auth.ts` içindeki `can.*` kurallarıyla her sayfa ve her sunucu işleminde yeniden denetlenir.

## Komutlar

| Komut | İşlev |
| --- | --- |
| `npm run dev` / `build` / `start` | Geliştirme, derleme, üretim sunucusu |
| `npm run db:generate` | Şema değişikliğinden SQL göçü üretir |
| `npm run db:migrate` / `db:seed` / `db:setup` | Göç, başlangıç verisi, ikisi birden |
| `npm run typecheck` · `npm test` | Tip denetimi · birim testleri |

## Tasarım

“Sır” dili: Kütahya çinisinden gelen porselen zemin, kobalt mürekkep, turkuaz sır ve tek bir kiremit kırmızısı vurgu.
Yapıyı projenin kendisi verir — her şey 36 aylık cetvele oturur. Gölge yerine ince çizgiler, 3 px köşeler, sayılan
ve kodlanan her şey için eş aralıklı rakamlar. Gündüz ve gece görünümü sağ üstten değişir; tercih çerezde saklanır.
