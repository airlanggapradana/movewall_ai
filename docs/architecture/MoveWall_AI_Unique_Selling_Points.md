# MoveWall AI: Fitur Tambahan untuk Unique Selling Point

Nov 7, 2026 · @Airlangga

## Ringkasan

Keunggulan jual MoveWall AI paling kuat bila dibangun dari kelemahan sistem saat ini, bukan dari ide Xbox di dokumen MOVEWALL.docx. Ide docx kurang cocok dengan sistem yang berjalan; tiga gagasannya (peta nyeri, gim dikunci resep terapis, latihan mandiri) bisa diambil dalam bentuk yang sesuai.

Tiga fitur dengan daya jual tertinggi: target ROM personal dengan kesulitan adaptif, pencatatan nyeri skala 0–10 beserta ROM maksimum per sesi, dan validasi pengukuran terhadap goniometer. Semuanya bergantung pada Fase 0: menutup celah keamanan R1–R6 dan membuat entitas `Patient` dengan persetujuan data.

Sumber: PRD MoveWall AI v2.0 (as-built, 7 November 2026) dan MOVEWALL.docx. Kode belum ditinjau langsung.

## Perbandingan: ide docx vs sistem saat ini

Dari tujuh elemen ide docx, hanya dasbor yang sudah ada penuh; peta nyeri baru sebagian, dan sisanya belum ada atau bertentangan dengan arsitektur.

| Elemen ide docx | Sistem saat ini (PRD v2.0) | Selisih |
| --- | --- | --- |
| Peta nyeri Nordic Body Map | Lima checkbox ya/tidak nyeri, diisi terapis setelah sesi | Parsial |
| Chatbot menganalisis dan meresepkan latihan | Rekomendasi PDF dari templat, bukan AI; resep belum ada (roadmap P2) | Belum ada |
| Gim terkunci sesuai resep | Gim hanya terkunci oleh paywall langganan | Belum ada |
| Karyawan bermain mandiri | Pasien tidak punya akun dan selalu didampingi terapis | Belum ada |
| Dasbor progres | KPI, riwayat sesi, tren skor, laporan PDF | Ada |
| Gim punggung bawah, leher, dan bahu | Hanya bahu (2 misi) | Beda cakupan |
| Perangkat Xbox | Webcam dan browser | Bertentangan |

### Mengapa menolak ide docx masuk akal

- **Xbox** bertabrakan dengan diferensiasi nomor 1, "tanpa perangkat khusus". Kinect juga sudah dihentikan Microsoft \[High confidence\]. Jalur teknis menghubungkan Xbox ke data web atau chatbot perlu diverifikasi.
- **Chatbot yang meresepkan latihan** membawa risiko klinis dan regulasi yang tidak sebanding dengan manfaatnya. Detail aturan alat kesehatan di Indonesia perlu diverifikasi.
- **Punggung bawah** (squat, lateral shifting) jauh lebih sulit diukur akurat dengan kamera 2D dibanding bahu \[Medium confidence\]. Cakupan akan melebar sebelum yang ada tervalidasi.

Tiga gagasan tetap layak diambil dalam bentuk yang cocok: peta nyeri yang lebih kaya, gim yang dikunci oleh resep terapis, dan latihan mandiri.

## Kelemahan terbesar sistem saat ini

Dua dari empat diferensiasi di PRD lemah sebagai bahan penjualan, dan klaim "AI" pada nama produk nyaris tanpa isi.

- **"Tanpa perangkat khusus" dan "edge-first"** bukan keunggulan unik, karena aplikasi berbasis webcam dan MediaPipe sudah umum \[Medium confidence; perlu verifikasi pesaing\].
- **"Objektif"** belum terbukti. R12 di PRD mengakui tidak ada kalibrasi dan validasi klinis. Yang tersimpan per sesi hanya skor, hit, level, dan waktu, bukan ROM maksimum.
- **"AI"** pada nama produk hanya berarti MediaPipe. Rekomendasi pada laporan PDF berasal dari templat.
- **Target gim tetap** (30–165°) tidak menyesuaikan pasien; pasien pasca-operasi mungkin tidak bisa mencapai 165°.

Fitur tambahan sebaiknya menutup celah ini, bukan sekadar menambah gim.

## Fitur tambahan yang diusulkan

Sembilan fitur; delapan pertama diurutkan menurut kontribusinya pada keunggulan jual, dan nomor 9 ditambahkan dari kebutuhan demo di booth; penilaian daya jual adalah analisis dari PRD, bukan data pasar.

| # | Fitur | Daya jual | Dasar di sistem | Usaha | Risiko utama |
| --- | --- | --- | --- | --- | --- |
| 1 | **Target ROM personal dan kesulitan adaptif.** Terapis menetapkan batas aman per pasien, lalu target gim menyesuaikan. | Tinggi | Roadmap P2; `adaptive_engine.py` sudah ada | Sedang-besar | Perlu entitas `Patient` dulu (R7) |
| 2 | **Nyeri skala 0–10 per gerakan** dan peta nyeri bahu di diagram tubuh (versi ringan Nordic Body Map), plus grafik gabungan ROM dan nyeri untuk terapis. | Tinggi | Mengganti 5 checkbox di tabel `Assessment` | Kecil-sedang | Rendah |
| 3 | **Rekam ROM maksimum, akurasi, dan kejadian kompensasi per sesi.** Menjadi dasar fitur 1, 2, dan 4. | Fondasi | Roadmap P1; perubahan skema dan klien | Sedang | Rendah |
| 4 | **Validasi terhadap goniometer** bersama mitra fisioterapi, plus kalibrasi kamera. Klaim terukur dan tervalidasi paling sulit ditiru. | Sangat tinggi jika berhasil | R12 | Besar; butuh mitra dan izin etik | Hasil bisa mengecewakan |
| 5 | **Mode latihan di rumah.** Terapis meresepkan, pasien bermain mandiri, hasil tersinkron. Produk berjudul "tele-rehabilitasi" tetapi belum punya fitur jarak jauh. | Tinggi | Roadmap P2 (`Role.USER`) | Besar | Kepatuhan data (R8); keamanan tanpa pengawasan |
| 6 | **Replay kerangka gerak** (garis sendi, bukan video) untuk ditinjau terapis. | Menengah-tinggi | Landmark sudah dihitung di klien | Sedang | Penyimpanan data lebih besar |
| 7 | **Draf ringkasan klinis oleh AI** untuk terapis, hanya dari angka terstruktur dan dengan persetujuan terapis. | Menengah | Menggantikan rekomendasi templat di PDF | Sedang | Halusinasi; batasi ke angka, tanpa saran diagnosis |
| 8 | **PWA offline** dengan antrean sinkron untuk klinik berinternet lemah. | Menengah | Model sudah lokal | Sedang | Konflik data saat sinkron |
| 9 | Player lock (kunci pemain). Operator mengunci satu pemain; sistem tetap mengikuti tubuhnya walau ada orang lain di sekitar kamera, dan gim dijeda bila pemain tertutup. | Menengah; terutama untuk demo di booth dan sesi dengan pendamping | MediaPipe dan smoothing sudah ada (PRD 5.3); pemilihan dan penguncian pemain belum ada | Sedang | Tubuh tertutup atau dua orang berdekatan bisa membuat pelacakan hilang; wajib diuji di lokasi |

Tiga hal yang menurut saya bukan pembeda: Misi 3 dan 4 (kebutuhan dasar, karena lima gerakan sudah dinilai nyerinya tetapi baru dua yang dimainkan), pintasan keyboard, dan multi-bahasa.

### Rincian fitur 9: Player lock

Player lock membuat MoveWall tetap mengikuti peserta yang sedang bermain, walau ada pengunjung atau juri di sekitar kamera. Hasilnya tetap perlu diuji langsung di booth, karena kamera bisa kehilangan peserta bila tubuhnya tertutup orang lain.

1. Peserta berdiri di area yang ditandai. Di layar kamera muncul kotak panduan agar posisi mudah diatur.
2. Operator menekan "Kunci Pemain". Sistem memilih tubuh yang berada di area itu sebagai pemain.
3. Sistem mengikuti tubuh pemain. MediaPipe membaca titik tubuh (bahu, pinggul, tangan), lalu membandingkan posisi antar-frame agar pilihan tetap pada orang yang sama.
4. Gerakan mengontrol gim. Saat peserta mengangkat lengan, penunjuk atau karakter bergerak, dan hasil pembacaan dihaluskan agar tidak bergetar.
5. Jika pemain hilang atau tertutup, gim dijeda. Operator meminta peserta kembali ke posisi atau menekan tombol pilih ulang pemain.

Contoh: saat peserta menyiram bunga dan juri berjalan di belakangnya, tangan juri tidak langsung menggerakkan gembor. Jika juri melintas tepat di depan sampai tubuh peserta tertutup, gim dijeda sementara.

**Status di sistem.** MediaPipe dan smoothing sudah ada menurut PRD. Pemilihan dan penguncian orangnya belum ada dan perlu dikembangkan; PRD hanya menyebut tombol Pause manual dan status "No full body detected", tanpa jeda otomatis.

**Batasan.** Player lock memakai kesinambungan posisi tubuh, bukan pengenalan wajah atau identitas. Bila dua orang berdekatan atau saling menutupi, sistem bisa kehilangan kepastian, sehingga tombol pilih ulang dan jeda otomatis penting untuk demo yang lancar. Di klinik, PRD (bagian 4) menyebut terapis mendampingi pasien di depan kamera, jadi kasus dua orang dalam bingkai juga muncul di luar booth \[inferensi dari PRD\].

## Urutan pengerjaan

Kerjakan fondasi data dan keamanan dulu, lalu personalisasi, dan tunda fitur yang paling mahal dan berisiko.

1. **Fase 0, prasyarat:** tutup R1–R6 dan buat entitas `Patient` beserta persetujuan data. Semua fitur di atas menyimpan data kesehatan, sedangkan `register`, `dev/seed`, dan simulator pembayaran saat ini masih terbuka.
2. **Fase 1:** fitur 3, lalu fitur 2. Keduanya murah dan membuat data bermakna klinis. Fitur 9 (player lock) didahulukan bila demo di booth sudah dijadwalkan.
3. **Fase 2:** fitur 1, target personal dan adaptif. Ini kandidat terkuat untuk keunggulan jual "gim yang menyesuaikan rentang gerak tanpa nyeri pasien".
4. **Fase 3, opsional:** fitur 4 dan 5. Keduanya paling membedakan dari pesaing, tetapi paling mahal dan berisiko.

## Batasan analisis

Analisis ini berdasar dua dokumen saja, jadi beberapa klaim perlu diperiksa sebelum dipakai di pitching atau keputusan teknis.

- Klaim tentang pesaing dan keunikan webcam serta MediaPipe belum diverifikasi ke sumber \[Medium confidence\].
- Aturan alat kesehatan di Indonesia untuk fitur resep dan analisis otomatis perlu diverifikasi.
- Jalur teknis integrasi Xbox perlu diverifikasi bila ide itu dibahas ulang.
- Estimasi usaha berasal dari PRD, bukan dari kode; tim developer sebaiknya mengoreksinya.
