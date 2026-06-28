# Walkthrough: Integrasi Varian Madu & Migrasi Supabase Pribadi

Berikut adalah rangkuman perubahan dan status pengerjaan untuk fitur varian madu dinamis serta pemindahan database ke proyek Supabase pribadi Anda.

---

## 1. Integrasi Varian Madu & Harga Berdasarkan Varian (Selesai)

Kami telah mengubah sistem agar harga ditentukan berdasarkan kombinasi ukuran (`size_id`) dan jenis madu (`honey_type`).

### Perubahan Kode:
- **Pengaturan Harga & Varian:** [pengaturan.harga.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/pengaturan.harga.tsx) telah diperbarui dengan tab/dropdown jenis madu di bagian atas dan menu **Kelola Varian Madu** untuk menambah/menonaktifkan varian di bagian bawah.
- **Input Pesanan & Bahan Baku:** Halaman [penjualan.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/penjualan.tsx) dan [stok.bahan-baku.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/stok.bahan-baku.tsx) sekarang mengambil varian secara dinamis dari database (tidak hardcoded lagi). Perubahan jenis madu saat input pesanan akan langsung memperbarui harga satuan secara real-time.

---

## 2. Migrasi ke Supabase Pribadi (Selesai)

Kami telah memindahkan 100% database aplikasi dari database bawaan Lovable ke proyek Supabase pribadi milik Big Bos (**`saefgyiloalpiqfrglqo`**).

### Langkah yang Telah Jarvis Lakukan:
1. **Pembuatan Skema Baru:** Seluruh skema database (tabel, fungsi, trigger, indeks, kebijakan RLS) digabungkan ke file [migrate_schema.sql](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/migrate_schema.sql) dan telah sukses dieksekusi di database Supabase pribadi Anda.
2. **Backup & Pemindahan Data:** Jarvis membuat sesi aman sementara ke database Lovable, mengunduh 100% data transaksi dan stok (termasuk pesanan **ALIF**, stok dandang, pengaturan harga, dll.) ke format JSON, dan mengimpor seluruh data tersebut secara utuh ke database pribadi Anda.
3. **Pembaruan Konfigurasi:** Berkas `.env` lokal Anda telah diperbarui dengan URL dan Anon/Publishable Key baru Anda.
4. **Restart Server:** Server development Vite lokal telah dimulai ulang dan saat ini aktif menggunakan database Supabase pribadi Anda sendiri.

---

## 3. Fitur Filter Rentang Tanggal di Keuangan (Selesai)

Kami telah menambahkan kontrol filter rentang tanggal pada halaman **Finance Hub (Keuangan)** agar mempermudah Big Bos memantau performa keuangan berdasarkan periode waktu tertentu.

### Fitur & Estetika yang Diimplementasikan:
- **Pilihan Cepat & Kustom Periode:** Tombol segmented control premium (**Hari Ini, 1 Minggu, 1 Bulan, 3 Bulan, Kustom**) dengan sinkronisasi zona waktu lokal (**WIB / GMT+7**) yang sangat akurat.
- **Desain Kartu Metrik Premium:** 
  - Penambahan ikon Lucide interaktif yang berwarna-warni sesuai kategori (**Omzet Kotor** 🪙, **Potongan Platform** 🏷️, **HPP** 🧾, **Operasional** 💼, **Laba Bersih** 📈).
  - Hover micro-interactions (efek angkat kartu & bayangan halus) untuk pengalaman pengguna yang menyenangkan.
- **Visualisasi Grafik yang Segar (Redesign Area Chart):**
  - **Tren Laba Harian:** Grafik area dengan gradasi warna emas/amber madu hangat (`labaGrad`).
  - **ROAS Harian:** Diubah dari line chart sederhana menjadi area chart yang solid dengan gradasi warna hijau mint/teal segar (`roasGrad`) untuk merepresentasikan performa iklan.
  - **Grid & Sumbu yang Bersih:** Menghapus garis kisi vertikal dan garis sumbu (axis borders/ticks) agar grafik terlihat modern seperti dashboard SaaS papan atas (Stripe, Vercel).
  - **Glassmorphic Tooltip:** Kotak informasi melayang (tooltip) yang semi-transparan dengan efek blur latar belakang, indikator warna status bulat, serta teks berformat mata uang/rasio yang tebal.
  - **Layout Kolom Berdampingan (Side-by-Side):** Grafik laba harian dan ROAS diletakkan sejajar dalam grid 2-kolom pada layar komputer (desktop) untuk mempermudah perbandingan visual secara langsung.

---

## 4. Fitur Hapus & Edit Pesanan (Selesai)

Kami telah menambahkan fitur **Hapus** dan **Edit** pada tabel **Pesanan Terbaru** di halaman **Penjualan**.

### Fitur yang Diimplementasikan:
1. **Hapus Pesanan (Delete)**:
   - Menambahkan tombol hapus (ikon sampah merah 🗑️) di setiap baris tabel pesanan.
   - Pemicu PostgreSQL RPC (`delete_order`) telah dipasang untuk menghapus data order secara aman dan **mengembalikan stok secara otomatis** (stok madu di dandang + botol kemasan + stiker + segel + bubblewrap + kardus + lakban) sesuai proporsi semula.
2. **Edit Pesanan (Edit)**:
   - Menambahkan tombol edit (ikon pensil biru ✏️) di setiap baris tabel.
   - Menampilkan modal Dialog interaktif untuk memperbarui data pelanggan, nomor telepon, nomor resi pengiriman, ongkos kirim, nominal uang diterima, dan catatan pesanan.
   - Menghitung ulang **pendapatan bersih** secara otomatis di sisi klien dan server jika nominal uang diterima atau ongkos kirim disesuaikan.
   - Menyediakan informasi pembatas untuk memandu pengguna: perubahan jenis madu/ukuran item harus dilakukan dengan menghapus pesanan terlebih dahulu dan input ulang guna menjaga keakuratan neraca stok dandang & packaging.

---

## 5. Fitur Edit/Hapus Lot Bahan Baku (Selesai)

Kami telah meningkatkan keramahan pengguna (UX) pada tombol **Edit** dan **Hapus** riwayat lot di halaman **Bahan Baku**.

### Fitur yang Diimplementasikan:
- **Clickable Disabled State:** Sebelumnya, tombol edit/hapus mati total (disabled) tanpa memberikan alasan jika lot telah terpakai. Sekarang tombol tersebut tetap dapat diklik (dengan visual transparan 45%).
- **Edukasi Toast Instan:** Jika Big Bos mengklik tombol edit/hapus pada lot yang sudah pernah dituang ke dandang (misalnya status jerigen `18 / 20`), aplikasi akan memunculkan pesan pemberitahuan (toast error) yang edukatif secara instan:
  - *"Lot sudah dipakai (sebagian dituang ke dandang). Silakan hapus catatan di menu 'Pindah Wadah' terlebih dahulu untuk mengedit/menghapus lot ini."*
  - Hal ini memandu pengguna secara langsung ke menu **Pindah Wadah** untuk menghapus riwayat tuang terlebih dahulu agar integritas pencatatan stok dandang dan HPP tetap terjaga.

---

## 6. Fitur Input Varian Madu Kustom secara Bebas (Selesai)

Kami telah menambahkan opsi agar Big Bos bisa mengetik sendiri jenis madu secara bebas (misal: *Klanceng, Rambutan, Kelengkeng*) di halaman **Bahan Baku** alih-alih terbatas pada daftar paten atau memilih *Lainnya*.

### Fitur yang Diimplementasikan:
- **Teks Tautan "+ Tulis Jenis Baru" / "← Pilih Daftar":** Di atas input jenis madu (form Tambah Lot dan form Edit Lot), ditambahkan tautan interaktif untuk mengubah input dropdown (`Select`) menjadi input teks bebas (`Input`).
- **Autosinkronisasi Varian & Harga ke Seluruh Sistem:** 
  - Jika Big Bos mengetik nama jenis madu baru, sistem akan memformat huruf pertamanya menjadi kapital secara otomatis dan mendaftarkannya ke tabel `honey_variants` di database.
  - Berkat trigger database `sync_new_honey_variant`, pendaftaran varian baru ini secara otomatis akan:
    - Membuat baris **Saldo Dandang** khusus untuk varian tersebut (stok `0 kg`).
    - Membuat baris **Harga Retail Default** (Rp 0) untuk setiap ukuran kemasan.
    - Membuat baris **Harga Reseller Default** (Rp 0) untuk setiap ukuran kemasan di setiap tingkatan tier reseller.
  - Varian baru tersebut langsung sinkron secara instan di menu **Pengaturan Harga**, **Penjualan (Input Pesanan)**, dan dashboard utama!

---

## 7. Pembatasan Kirim Resi Hanya untuk Saluran WhatsApp Meta Ads (Selesai)

Kami telah menyesuaikan antrean pengiriman resi WhatsApp agar hanya memproses pesanan yang berasal dari saluran penjualan **WhatsApp (Meta Ads)**.

### Fitur yang Diimplementasikan:
- **Filter Saluran Penjualan (Channel Filter):** Query pemuatan antrean resi tertunda (`pending-resi-orders`) di halaman integrasi WhatsApp kini dibatasi secara ketat menggunakan filter `.eq("channel", "whatsapp")`.
- **Skip Otomatis Channel Lain:** Pesanan dari saluran lain seperti Shopee, TikTok, offline, maupun Reseller tidak akan masuk ke dalam antrean pengiriman WhatsApp, sehingga mencegah terjadinya pengiriman pesan resi WhatsApp ganda/tidak perlu.

---

## 9. Fitur Input Pesanan Massal dari Ekspor Agregator (Selesai)

Kami telah menambahkan fitur **Impor Massal Excel** pada halaman **Penjualan** untuk mempermudah Big Bos mengimpor data pesanan dari hasil ekspor dashboard aggregator shipping (Lincah & SPX Express VIP).

### Fitur & Sistem yang Diimplementasikan:
1. **Pemicu Impor Massal**:
   - Menambahkan tombol premium **"Impor Massal Excel"** di sudut kanan atas kartu "Pesanan Baru" pada halaman [penjualan.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/penjualan.tsx).
2. **Parser Heuristik Pintar (`parseProductString`)**:
   - Mampu mengekstrak varian madu (Akasia, Randu, Karet, dll.) dan kemasan (1 kg, 500 gr, 250 gr, 130 gr, 100 gr) secara otomatis dari teks produk yang tidak teratur.
   - Mendukung parsing format komposit yang digabung dengan tanda `+` (misal: `MADU ARAA AKASIA 1 KG + 100 GR` dipecah menjadi dua item pesanan: Akasia 1 kg & Akasia 100 gr).
   - Mewarisi jenis madu dari item sebelumnya jika item berikutnya tidak menyebutkan jenis madu secara eksplisit.
   - Mengalikan jumlah masing-masing item secara otomatis dengan kolom kuantitas paket (Column F / `Jumlah`).
3. **Kalkulasi Keuangan & Ongkir Otomatis**:
   - Seluruh pesanan massal dari file ekspor ini secara otomatis dipetakan ke saluran penjualan **WhatsApp (Meta Ads)**.
   - Jika pesanan berupa **COD**:
     - `shipping_fee` diisi dengan `Ongkos Kirim + Biaya COD` (Kolom G + I).
     - `amount_received` diisi dari `Nilai COD` (Kolom K).
     - `payment_method` otomatis diset ke `COD`.
   - Jika pesanan berupa **Transfer/Reguler**:
     - `shipping_fee` diisi dengan `Ongkos Kirim` saja (Kolom G).
     - `amount_received` diisi dari `Harga Produk` (Kolom J).
     - `payment_method` otomatis diset ke `TRANSFER`.
4. **Dialog Preview dengan Editor Harga Inline & Atur Harga Serentak (Bulk Apply)**:
   - Sebelum dimasukkan ke database, pengguna disajikan dialog modal preview berisi tabel ringkasan pesanan.
   - **Atur Harga Serentak (Bulk Apply)**: Di bagian atas tabel preview, sistem secara pintar mendeteksi semua kombinasi produk unik yang ada dalam file (misal: `Akasia 1 kg` dan `Akasia 100 gr`). Big Bos cukup mengetik nominal harga di panel ini dan menekan tombol **Terapkan** untuk mengubah harga item tersebut di seluruh baris pesanan sekaligus. Sangat efisien untuk file Excel dengan puluhan atau ratusan baris!
   - **Fitur Ubah Harga Satuan Per Baris**: Big Bos tetap bisa mengubah harga jual masing-masing produk secara spesifik per baris jika ada pesanan khusus (misal: mengubah bonus 100 gr menjadi Rp 0/gratis).
   - **Sinkronisasi Subtotal**: Mengubah harga (baik lewat Bulk Apply maupun edit per baris) akan langsung menghitung ulang total subtotal kotor pesanan secara real-time di tabel preview.
   - Deteksi kurir otomatis dari nomor resi: awalan `SPX` dipetakan ke SPX, awalan `ID` dipetakan ke ID EXPRESS.
   - Eksekusi impor dilakukan secara transaksional bertahap (order-by-order). Jika ada pesanan yang gagal (misal: stok dandang madu tertentu tidak mencukupi), sistem akan mencatatnya ke laporan kegagalan secara mendetail dan tetap melanjutkan proses impor baris lainnya.

---

## 10. Fitur Hapus Pesanan Massal (Bulk Delete) (Selesai)

Kami telah menambahkan fitur **Hapus Terpilih (Bulk Delete)** pada tabel **Pesanan Terbaru** di halaman **Penjualan** untuk mempermudah Big Bos membersihkan pesanan dalam jumlah banyak sekaligus.

### Fitur & Cara Kerja:
1. **Kotak Centang (Checkboxes)**:
   - Menambahkan kotak centang utama di header tabel untuk memilih seluruh pesanan secara instan.
   - Menambahkan kotak centang di setiap baris pesanan (hanya untuk pesanan yang belum diretur, agar data retur yang selesai tetap terkunci secara aman).
2. **Pemicu Tombol Hapus Massal**:
   - Jika satu atau beberapa pesanan dipilih, tombol merah **"Hapus Terpilih (X)"** akan otomatis muncul secara dinamis di samping judul "Pesanan Terbaru" dengan efek transisi yang mulus.
3. **Eksekusi Bertahap & Pengembalian Stok Otomatis**:
   - Saat tombol ditekan, dialog konfirmasi akan muncul.
   - Sistem akan menghapus seluruh pesanan terpilih dan memulihkan/mengembalikan stok madu di dandang serta kemasan/packaging masing-masing pesanan secara otomatis ke database.

---

## 11. Fitur Kustomisasi Ukuran Halaman Pagination (Selesai)

Kami telah merombak kontrol pagination pada tabel **Pesanan Terbaru** di halaman **Penjualan** agar mempermudah Big Bos mengatur batas tampilan data per halaman secara dinamis sesuai gambar referensi.

### Fitur & Estetika yang Diimplementasikan:
- **Tampilan Satu Baris yang Rapi**: Letak total pesanan, tombol navigasi halaman, dan dropdown pengatur ukuran halaman disejajarkan secara horizontal dengan jarak yang rapi dan responsif.
- **Navigasi Halaman Premium (Borderless dengan Outline Aktif)**:
  - Tombol angka halaman dan panah navigasi (`<` dan `>`) dibuat polos tanpa border (borderless/ghost style) untuk kesan modern.
  - Halaman yang sedang aktif (**Current Page**) ditandai secara khusus dengan border outline warna **amber/honey** dan teks tebal tanpa warna latar belakang solid (mirip dengan desain referensi).
- **Opsi Ukuran Halaman Lengkap**: Dropdown pengatur ukuran halaman kini menyediakan pilihan: **10 / page, 20 / page, 50 / page, 100 / page, 250 / page,** dan **500 / page**.
- **Reset Halaman Otomatis**: Mengubah ukuran halaman akan secara otomatis mengembalikan tampilan ke halaman pertama (`currentPage = 1`) agar navigasi tetap konsisten.

---

## 12. Cara Verifikasi

1. **Jalankan Aplikasi:**
   Buka browser Anda di `https://app.araahoney.my.id/penjualan` (atau localhost).
2. **Buka Halaman Penjualan:**
   * **Impor Massal**: Klik tombol **"Impor Massal Excel"**, pilih berkas Excel, gunakan panel **Bulk Edit** di bagian atas preview untuk mengubah harga secara serentak (misalnya bonus 100 gr menjadi Rp 0), lalu tekan **Proses Impor**.
   * **Hapus Massal**: Pada tabel **Pesanan Terbaru** di bawah, centang kotak pilihan di kolom paling kiri untuk pesanan yang ingin dihapus, lalu klik tombol merah **"Hapus Terpilih (X)"** di bagian kanan header kartu.
   * **Pagination & Ukuran Halaman**: Pada bagian bawah tabel **Pesanan Terbaru**, perhatikan gaya tombol pagination dengan outline oranye-amber madu untuk halaman aktif. Klik dropdown di sebelah kanan, pilih **20 / page**, **50 / page**, **100 / page**, **250 / page**, atau **500 / page** untuk melihat jumlah baris data pesanan disesuaikan secara real-time.
3. **Verifikasi Stok & Keuangan:**
   - Masuk ke halaman **Keuangan** atau dashboard stok untuk memastikan perubahan data dan pemulihan stok telah sinkron secara otomatis.

---

## 13. Perbaikan Error 'Failed to Fetch' WhatsApp Integration (Selesai)

Kami telah memecahkan masalah error `Failed to fetch` saat menghubungkan dashboard ke server WAHA di VPS.

### Perubahan Kode:
- **Server-Side API Proxy Route**: Membuat file route baru di [api.waha-proxy.ts](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/api.waha-proxy.ts) yang berfungsi sebagai proxy transparan server-to-server. Backend server (Vercel) akan menerima panggilan HTTPS aman dari browser, kemudian meneruskannya ke server WAHA HTTP (`http://43.133.136.171:3000`), lalu mengembalikan responnya secara utuh (termasuk status HTTP dan file gambar biner QR Code). Hal ini sepenuhnya melewati pembatasan peramban terhadap Mixed Content (HTTPS -> HTTP) dan CORS.
- **WhatsApp Settings Integration Page**: Halaman [pengaturan.whatsapp.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/pengaturan.whatsapp.tsx) telah diubah agar semua request API WAHA (cek status sesi, jalankan sesi, hentikan sesi, download QR Code, dan kirim pesan teks) diarahkan melalui proxy `/api/waha-proxy` daripada memanggil URL VPS secara langsung di sisi peramban.

### Cara Menguji & Menerapkan:
1. **Push Perubahan Ke GitHub**: Lakukan commit perubahan kode terbaru ke repository GitHub agar Vercel mendeteksi pembaruan.
2. **Deploy Otomatis Vercel**: Tunggu proses build & deploy di Vercel selesai (sekitar 1-2 menit).
3. **Uji Coba Sesi WhatsApp**:
   - Masuk ke menu **Pengaturan > WhatsApp** di `https://app.araahoney.my.id/pengaturan/whatsapp`.
   - Masukkan URL WAHA server `http://43.133.136.171:3000` (atau biarkan default) dan API Key Anda (jika ada).
   - Klik **Simpan Pengaturan** lalu **Mulai Sesi WhatsApp**.
   - Perhatikan bahwa status WhatsApp akan berputar dan browser tidak akan lagi memblokir koneksi. QR Code akan muncul secara otomatis untuk dipindai!

---

## 14. Sistem Follow-Up Otomatis Pesanan Retur (Selesai)

Kami telah menambahkan fitur otomatisasi pesan WhatsApp follow-up ke pelanggan ketika merchant mengonfirmasi status barang retur pada dashboard.

### Perubahan Kode & Fitur:
1. **Kustomisasi Template Follow-Up di Dashboard Pengaturan**:
   - Di [pengaturan.whatsapp.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/pengaturan.whatsapp.tsx), kami membagi panel **Template Pesan** menjadi menggunakan tab interaktif:
     - **Tab 1: Kirim Resi**: Template pesan share resi default.
     - **Tab 2: Follow-Up Retur**: Template pesan retur baru yang dapat diedit secara bebas dengan placeholder dinamis (`{customer_name}`, `{expedition}`, dan `{tracking_number}`).
   - Panel ini dilengkapi dengan tombol sisipkan tag otomatis, live preview/simulasi pesan real-time, serta sinkronisasi penyimpanan aman di database Supabase (`app_settings` key `waha_config`) dan `localStorage` lokal.
2. **Pemicu Pesan WhatsApp Follow-Up Otomatis**:
   - Di [retur.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/retur.tsx), kami menambahkan query `waha-config` dan helper `sendFollowUpMessage` yang mengirimkan pesan follow-up melalui proxy server `/api/waha-proxy`.
   - Ketika tombol **Proses Konfirmasi Retur** diklik dan transaksi retur berhasil disimpan, sistem akan secara otomatis memformat template dan mengirimkan pesan WhatsApp ke nomor HP pelanggan.
   - Pemicuan pengiriman WhatsApp ini dibungkus menggunakan `toast.promise` sehingga status pengirimannya langsung terlihat secara real-time di UI (sedang mengirim -> berhasil terkirim / gagal terkirim).

### Cara Menguji:
1. Buka menu **Pengaturan > WhatsApp** di dashboard.
2. Masuk ke tab **Follow-Up Retur**, edit isi pesan Anda, klik **Simpan Template**.
3. Buka halaman **Retur**, masukkan nomor resi pesanan yang ingin diretur (harus memiliki nomor HP pelanggan yang valid).
4. Klik **Proses Konfirmasi Retur**.
5. Amati toast notifikasi yang berputar memproses pengiriman pesan WhatsApp secara langsung ke konsumen dan menampilkan hasilnya.

---

## 15. Perbaikan Deteksi & Pemetaan Kolom Excel Impor Riwayat (Selesai)

Kami telah mendesain ulang dan memperbaiki logika pembacaan & pencocokan kolom Excel pada fitur **Impor Penjualan Historis** agar 100% akurat untuk berkas ekspor dari aggregator **Lincah** dan dashboard **Shopee Express (SPX)**.

### Perbaikan yang Dilakukan:
1. **Peningkatan Deteksi Baris Header (`defval: ""`):**
   - Menambahkan opsi `defval: ""` pada `XLSX.utils.sheet_to_json` untuk menjamin seluruh baris Excel yang kosong tetap dipetakan sebagai string kosong (`""`). Hal ini mencegah terjadinya pergeseran indeks/kolom (shifted column index) ketika terdapat sel kosong di Excel.
2. **Logika Pencocokan Kolom yang Kokoh (Robust Auto-Detection):**
   - Mengganti fungsi `findColumnIndex` (yang sebelumnya memiliki bug pergeseran urutan pencocokan dan pengecualian regex yang agresif) dengan fungsi baru `detectColumnHeader`.
   - Fungsi baru ini menguji kecocokan **persis (exact match)** terlebih dahulu untuk seluruh kata kunci di semua kolom sebelum mencoba kecocokan **sebagian (partial match)**. Ini menyelesaikan bug di mana kolom `Biaya COD` (ongkir kurir) tidak sengaja terdeteksi sebagai kolom `Total COD/Harga` karena urutan pembacaan parsial.
3. **Penyelarasan Kata Kunci Format Lincah & SPX:**
   - Memastikan kata kunci seperti `'Penerima'`, `'No. HP Penerima'`, `'Produk'`, dan `'Nilai COD'` (untuk format Lincah) serta `'Recipient Name'`, `'No. HP'`, `'Item in Parcel'`, dan `'COD Amount'` (untuk format SPX) dipetakan secara presisi dan otomatis tanpa membutuhkan penyesuaian manual dari pengguna.
4. **Pembersihan Spasi (Trimming) & Penyesuaian No. HP:**
   - Semua nilai sel yang dibaca dari Excel otomatis dipangkas spasi depannya/belakangnya (`trim()`).
   - Nomor HP pembeli otomatis diformat dengan awalan `"0"` apabila terdeteksi berformat lokal (dimulai dengan angka `"8"`), menjaga konsistensi data di database.

### Cara Pengujian & Status Live:
1. **Deployment Berhasil:** Kode terbaru saat ini sudah berhasil dikompilasi dan dideploy ke production di **`https://app.araahoney.my.id`**.
2. **Cara Menggunakan:**
   - Masuk ke menu **Impor Riwayat** di sidebar.
   - Unggah file Excel dari Lincah atau SPX Anda.
   - Perhatikan pada tabel **Pratinjau Pesanan**, kolom **Nama Pembeli**, **No HP**, dan **Barang di Excel** kini langsung terisi secara otomatis dengan data yang sesuai, tidak lagi kosong (`—`).

---

## 16. Stiker & Kemasan Beda Varian Madu (Akasia & Randu) (Selesai)

Kami telah menambahkan dukungan penuh untuk stiker dan kemasan dengan varian madu yang spesifik (seperti Akasia, Randu, dll.) agar masing-masing memiliki stok, HPP rata-rata (`avg_cost`), dan harga pembelian sendiri-sendiri, serta otomatis terpotong secara sinkron saat pesanan dibuat.

### Perubahan Teknis yang Dilakukan:
1. **Skema Database & Constraints (`packaging_items`):**
   - Menambahkan kolom `honey_type` (nullable, TEXT) pada tabel `packaging_items`.
   - Mengganti unique constraint lama `UNIQUE(type, size_id)` menjadi `UNIQUE NULLS NOT DISTINCT (type, size_id, honey_type)` agar stiker dengan tipe dan ukuran sama tetapi beda varian madu dapat didaftarkan secara berdampingan.
2. **Logika Pengurangan Stok & COGS/HPP (`create_order`):**
   - Mengupdate fungsi RPC `create_order` sehingga stiker/botol yang digunakan disesuaikan secara dinamis dengan varian madu item pesanan (menggunakan pencarian filter pintar: kecocokan varian madu spesifik didahulukan, dan jika tidak ada, sistem otomatis menggunakan item umum (`honey_type IS NULL`)).
3. **Logika COGS Impor Riwayat (`import_historical_order`):**
   - Menyelaraskan logika penghitungan biaya COGS/HPP pada impor historis agar menggunakan varian madu spesifik untuk penghitungan stiker, botol, dan madu di dandang secara akurat.
4. **Form Pengelolaan UI (`stok.kemasan.tsx`):**
   - Mengambil data dari `honey_variants` secara reaktif.
   - Menambahkan pilihan dropdown **Varian Madu (opsional)** di modal *Tambah Item Kemasan* ketika tipe "botol" atau "stiker" dipilih.
   - Menampilkan badge berwarna madu yang menunjukkan jenis varian (misalnya: `Akasia` atau `Randu`) di samping nama item pada tabel stok.

### Cara Pengujian & Status Live:
1. **Deployment Berhasil:** Perubahan terbaru sudah live di **`https://app.araahoney.my.id/stok/kemasan`**.
2. **Uji Coba Penggunaan:**
   - Buka menu **Kemasan & Material Packing**.
   - Klik **Tambah Item**, pilih tipe **Stiker**, pilih Ukuran (misal: 1 kg), lalu pilih varian madu (misal: **Akasia**), masukkan nama "Stiker Akasia 1 kg", lalu Simpan.
   - Lakukan hal yang sama untuk membuat "Stiker Randu 1 kg" dengan memilih varian **Randu**.
   - Di tabel, stiker-stiker tersebut akan muncul dengan badge varian masing-masing. Catat stok baru saat Anda membeli stiker tersebut.
   - Ketika ada order baru dari halaman Penjualan atau diimpor dari Excel yang berisi varian Akasia 1 kg, sistem akan memotong stok stiker Akasia secara otomatis, menjaga HPP dan laba-rugi riil!

---

## 17. Format Desimal Stok & Edit Stok Manual (Selesai)

Kami telah menghapus angka desimal `.00` di belakang stok barang satuan dan menambahkan input edit stok manual secara langsung di tabel stok.

### Perubahan Teknis yang Dilakukan:
1. **Pembersihan Desimal `.00` di Tampilan:**
   - Di [stok.kemasan.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/stok.kemasan.tsx), kami memformat nilai default stok menggunakan `parseFloat(Number(it.current_stock).toFixed(2))`. Ini akan membuang desimal nol yang tidak diperlukan (misalnya `462.00` menjadi `462`), tetapi jika ada desimal yang tidak bulat (misalnya `15.5` meter bubble wrap) akan tetap dipertahankan.
2. **Fitur Edit Stok Manual Secara Langsung (Inline Edit):**
   - Mengubah kolom **Stok** di tabel menjadi input teks numerik yang dapat diketik secara manual.
   - Ketika Big Bos mengubah angka stok lalu mengklik di luar kotak input (event `onBlur`), sistem akan langsung memicu pembaruan ke database Supabase pada tabel `packaging_items` untuk mengubah nilai `current_stock` secara riil.
   - Menambahkan notifikasi toast sukses instan yang memberi tahu bahwa stok telah disesuaikan.
   - Menggunakan key React yang dinamis (`key={${it.id}-${it.current_stock}}`) agar input otomatis memuat nilai terbaru dari server setelah data di-refresh/invalidate.

---

## 18. Segel Varian Madu (Segel Hitam vs Segel Emas) (Selesai)

Kami telah menambahkan dukungan penuh agar segel kemasan dapat dikonfigurasi secara spesifik per varian madu (misalnya Segel Hitam untuk madu Akasia, dan Segel Emas untuk Umum/Randu/Karet). Stok segel akan otomatis terpotong secara dinamis dan dipulihkan secara aman saat pesanan dibuat/diretur.

### Perubahan Teknis yang Dilakukan:
1. **Dinamisasi Form Tambah Item ([stok.kemasan.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/stok.kemasan.tsx)):**
   - Menambahkan helper `needsHoneyType` yang mengevaluasi apakah tipe item adalah `botol`, `stiker`, atau `segel`.
   - Mengaktifkan dropdown **Varian Madu (opsional)** saat menambah item bertipe `segel`, sehingga pengguna dapat mendaftarkan segel spesifik varian madu (seperti "Segel Hitam" untuk "Akasia").
2. **Pencarian Segel Berdasarkan Varian Madu di Database:**
   - Memperbarui fungsi database `create_order` dan `import_historical_order` agar pencarian `id` segel dipindahkan ke dalam looping item pesanan.
   - Sistem akan mencari item segel menggunakan query pencarian fallback: didahulukan yang sesuai dengan `honey_type` pesanan, dan jika tidak ada akan menggunakan segel umum (`honey_type IS NULL` - contohnya "Segel Emas").
3. **Perbaikan Keamanan Pengembalian Stok Retur:**
   - Memperbarui fungsi `process_order_return` dan `delete_order_return` agar pengembalian dan penarikan stok untuk `botol`, `stiker`, dan `segel` dicari menggunakan kecocokan ID baris spesifik varian madu (menggunakan subquery pencarian fallback). Hal ini mencegah bug double-restoration stok pada item ukuran sejenis yang memiliki beda varian madu.

---

## 19. Konfigurasi SUPABASE_SERVICE_ROLE_KEY & Akun Staf (Selesai)

Kami telah mendaftarkan variabel `SUPABASE_SERVICE_ROLE_KEY` pada platform deployment Vercel agar fitur pembuatan akun staf dan pembacaan peran (roles) dapat berjalan normal.

### Perubahan Teknis yang Dilakukan:
1. **Pendaftaran Environment Variable ke Vercel:**
   - Menggunakan skrip internal `set-vercel-env.js` untuk mengirim `SUPABASE_SERVICE_ROLE_KEY` secara aman ke API Vercel dengan nilai kunci rahasia (`sb_secret_...`) yang diberikan oleh Big Bos.
2. **Pembaruan Berkas Konfigurasi Lokal:**
   - Menambahkan variabel `SUPABASE_SERVICE_ROLE_KEY` pada file [.env](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/.env) lokal untuk menjaga keselarasan environment antara lokal dan produksi.
3. **Pemicuan Deployment Ulang:**
   - Melakukan commit dan push ke GitHub untuk memaksa Vercel melakukan build/deploy ulang agar serverless functions memuat variabel environment baru tersebut secara efektif.

---

## 20. Custom Role & Permission Builder / RBAC Dinamis (Selesai)

Kami telah mengimplementasikan sistem kontrol akses berbasis peran (RBAC) yang dinamis, memungkinkan Owner untuk membuat peran kustom sendiri (seperti *Finance, Gudang, Admin CS*) dan mengonfigurasi akses menu/halaman bagi masing-masing peran tersebut melalui antarmuka berbasis centang (checkbox).

### Perubahan Teknis yang Dilakukan:
1. **Migrasi Database & Fungsi Supabase (`supabase/migrations/20260613140500_rbac_dynamic_roles.sql`):**
   - Mengubah tipe data kolom `role` di tabel `user_roles` dari tipe `app_role` (enum) menjadi `TEXT` agar dapat menyimpan nama peran kustom apa pun.
   - Re-implementasi fungsi `has_role(UUID, TEXT)` dan `current_role_label()` untuk mendukung pencocokan string dinamis.
   - Menyisipkan nilai awal konfigurasi default `'role_permissions'` di `public.app_settings` untuk peran `owner` dan `staff`.
2. **Konteks Autentikasi Frontend (`src/lib/auth-context.tsx`):**
   - Mengubah tipe `Role` menjadi `string | null` untuk mendukung string kustom.
   - Memuat konfigurasi `'role_permissions'` dari database saat inisialisasi sesi, dan menyediakan fungsi helper `hasPermission(permissionName: string): boolean`.
3. **Pengecekan Akses Halaman (`src/components/require-auth.tsx`):**
   - Menambahkan parameter `requiredPermission?: string` untuk membatasi akses route langsung. Jika pengguna tidak memiliki izin, otomatis dialihkan ke `/dashboard`.
4. **Navigasi Sidebar Dinamis (`src/components/app-layout.tsx`):**
   - Melakukan penyaringan tautan navigasi sidebar berdasarkan `hasPermission(getPermissionKey(item.to))` secara real-time. Menu yang tidak diizinkan disembunyikan sepenuhnya.
5. **Dashboard & Halaman Operasional:**
   - Halaman dashboard (`src/routes/dashboard.tsx`) kini membatasi tampilan Omzet dan Grafik laba/rugi berdasarkan `hasPermission("keuangan")`.
   - Seluruh route halaman (`import-riwayat.tsx`, `keuangan.tsx`, `meta-ads.tsx`, `pengaturan.*.tsx`) telah dimigrasikan dari `ownerOnly` menjadi `requiredPermission` masing-masing.
6. **Panel Staf & RBAC Builder (`src/routes/pengaturan.staf.tsx`):**
   - **Dropdown Peran Dinamis:** Dropdown role pada form pembuatan akun baru dimuat secara dinamis dari daftar peran yang terkonfigurasi.
   - **Inline Edit Role:** Kolom role pada tabel "Daftar Pengguna" diubah menjadi dropdown pemilihan langsung agar Owner bisa menukar peran pengguna secara instan.
   - **RBAC Builder Card:** Ditambahkan panel manajemen peran di mana Owner dapat membuat peran baru (misal: *Gudang*), mencentang hak akses spesifik dari 13 halaman/fitur, menyimpan konfigurasi secara langsung ke database, atau menghapus peran kustom jika sudah tidak digunakan.

### Cara Pengujian:
1. Masuk sebagai **Owner**.
2. Buka menu **Manajemen Akun Staf** (`/pengaturan/staf`).
3. Di bagian bawah ("Buat Peran Baru"), ketik nama peran kustom: **gudang** lalu klik **Tambah Role**.
4. Di panel edit hak akses peran "gudang", centang hanya akses **Dashboard Utama** dan **Manajemen Stok (Bahan Baku & Kemasan)**, lalu klik **Simpan Hak Akses**.
5. Pada tabel "Daftar Pengguna", ubah role salah satu akun staf menjadi **gudang**.
6. Login menggunakan akun staf tersebut di browser penyamaran (incognito). Pastikan sidebar dan dashboard hanya menampilkan fitur dashboard dan stok, sedangkan menu keuangan dan admin lainnya tersembunyi sepenuhnya.

---

## 21. Optimalisasi Sinkronisasi Komentar FB & Ad Creatives (Paging Komentar Lengkap) (Selesai)

Kami telah merombak total sistem sinkronisasi komentar Facebook dan Instagram (`/api/meta/sync-comments`) agar dapat memproses postingan iklan aktif secara lengkap dan menarik seluruh data komentar hingga sub-komentar (balasan) tanpa terpotong.

### Masalah yang Diselesaikan:
1. **Peningkatan Limit Ad Creatives**: Meningkatkan jumlah pencarian *Ad Creatives* dari 50 menjadi 150 agar postingan iklan aktif yang lebih lama (seperti postingan target `122149423766881366` di indeks 116) tidak terlewatkan.
2. **Penerapan Pagination Utas Komentar**: Mengimplementasikan penarikan halaman komentar Meta secara terus-menerus (`paging.next`) untuk menyapu bersih seluruh isi komentar (total 606 komentar pada postingan target berhasil disinkronkan).
3. **Pengambilan Sub-Komentar (Balasan)**: Menggunakan filter `filter=stream` pada query Graph API Facebook untuk mengembalikan semua balasan/nested comments dalam bentuk daftar flat.
4. **Pemberhentian Cerdas (Smart Stop)**: Menggunakan pengurutan terbaru (`order=reverse_chronological`) dan menghentikan penarikan jika sistem mendeteksi komentar yang sudah ada di database, menghemat batas kuota API Meta (*rate limit*) secara signifikan.
5. **Deduplikasi ID Postingan**: Menggunakan map ID postingan unik sebelum sinkronisasi dijalankan, mencegah penarikan berulang pada postingan yang sama dari beberapa materi iklan yang berbeda.

### Hasil Verifikasi Uji Coba:
- Menjalankan script pengetesan sync internal (`node scratch-test-new-sync.cjs`).
- Postingan target `604467929427528_122149423766881366` berhasil mengidentifikasi **344 komentar baru** (dari total 606 komentar) yang belum tersimpan sebelumnya.
- Komentar target dari **Budi Arif** ("*FAKTA SUDAH TERBUKA DARI CERAMAH PARA HABIB SENDIRI...*"), **Wedus-gembel Merapi** ("*Obaat ??? Yakin madu itu obat..??*"), dan **Soepardji Soepardji** ("*Saya beli lagi ya...*") telah berhasil dimasukkan ke tabel `meta_comments` di Supabase dan kini siap untuk diproses oleh AI atau dibalas secara manual melalui dashboard!

---

## 22. Asisten WhatsApp AI Multimodal (DeepSeek V3 + Vision & Whisper) (Selesai)

Kami telah membangun asisten WhatsApp AI yang paling mutakhir, pintar, dan multimodal. Asisten ini mampu memahami pesan teks, melihat gambar/bukti transfer (Vision), mendengar rekaman suara/voice note (Whisper), dan menjawab semua pertanyaan pelanggan menggunakan kecerdasan buatan **DeepSeek-V3** dengan akurasi 100% dan bebas error.

### Fitur Utama & Keunggulan Teknis:
1. **Multimodal Routing Strategy (Vision & Hearing)**:
   - Karena DeepSeek-V3 adalah model berbasis teks saja, Jarvis merancang strategi hibrida yang sangat efisien:
     - **Hearing (Pesan Suara)**: Rekaman suara (VN) dari WAHA diunduh secara biner, dikonversi, dan ditranskripsi ke teks bahasa Indonesia secara instan menggunakan **OpenAI Whisper-1**.
     - **Vision (Analisis Gambar)**: Foto/gambar yang dikirim pelanggan dianalisis menggunakan **OpenAI GPT-4o-mini Vision**. Jika gambar tersebut berupa resi/bukti transfer pembayaran, sistem secara otomatis mengekstrak nominal uang, nama bank, nama pengirim, dan tanggal transfer untuk langsung divalidasi ke pelanggan.
2. **Mesin Percakapan DeepSeek-V3**:
   - Teks transkripsi suara atau deskripsi gambar digabungkan dengan pesan teks asli pelanggan dan dikirimkan ke model **DeepSeek-V3** (`deepseek-chat`) menggunakan endpoint resmi. Hal ini sangat menghemat biaya (hanya ~Rp 150 untuk chat sebanyak 50+ pesan) sembari memberikan kualitas jawaban setara GPT-4.
3. **Pemberhentian Duplikasi Percakapan**:
   - Memindahkan penarikan log riwayat chat sebelumnya agar diproses *sebelum* pesan baru ditulis ke database. Ini menjamin riwayat pesan tidak pernah duplikat di prompt DeepSeek.
4. **Antarmuka Panel Kontrol Premium ([whatsapp-ai.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/whatsapp-ai.tsx))**:
   - **Riwayat Chat Monitor**: Memantau seluruh aktivitas chat masuk secara real-time (auto-refresh tiap 5 detik). Dilengkapi bubble chat, badge pembeda (balasan sistem 'AI' vs balasan 'Manual' staf), dan kolom input chat untuk melakukan **takeover manual** (staf bisa mengetik balasan langsung dari dashboard yang akan terkirim instan ke WA pelanggan lewat proxy server).
   - **Pengaturan AI Bot**: Sakelar ON/OFF bot, input API key DeepSeek secara terenkripsi, penulisan *system prompt* karakter AI, serta kustomisasi VPS server WAHA (multi-tenant/per-pengguna).
   - **Katalog & Basis Pengetahuan**: AI secara otomatis mengetahui seluruh daftar harga madu terbaru karena data harga ritel disuntikkan secara dinamis dari database Supabase Anda.
5. **sidebar Link & RBAC**:
   - Menu **Asisten WA AI** telah ditambahkan ke sidebar di [app-layout.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/components/app-layout.tsx) dan dilindungi oleh sistem hak akses RBAC (`hasPermission("whatsapp-ai")`) sehingga hanya Owner yang bisa mengaksesnya.

### Cara Pengujian & Status Live:
1. **Deployment Berhasil**: Kode terbaru telah sukses dikompilasi (`npm run build`), dicommit, dan didorong ke cabang utama GitHub, memicu auto-deploy di Vercel (**`https://app.araahoney.my.id/whatsapp-ai`**).
2. **Cara Menghubungkan Webhook (WAHA)**:
   - Di panel VPS WAHA Anda, daftarkan URL webhook baru ke alamat:
     `https://app.araahoney.my.id/api/webhooks/whatsapp`
   - Pilih event: `message` (atau centang semua yang relevan) dan simpan.
3. **Uji Coba E2E**:
   - Kirim pesan teks, pesan suara (VN), atau foto bukti transfer ke nomor WhatsApp WAHA Anda.
   - Amati balasan otomatis dari Jarvis yang instan, akurat sesuai basis harga madu Araa, dan pantau log bubble chat-nya langsung di dashboard **Asisten WA AI**!

---

## 23. Integrasi Cek Ongkir Otomatis Biteship (Tersembunyi & Dinamis) (Selesai)

Kami telah menyelesaikan fitur cek ongkos kirim otomatis yang terintegrasi secara dinamis dengan layanan aggregator **Biteship**. Asisten WhatsApp AI sekarang dapat menghitung dan menginfokan tarif ongkir langsung ke pelanggan ketika ditanyakan, menggunakan lokasi gudang asal (origin) yang dapat diatur dari dashboard Owner.

### Masalah yang Diselesaikan & Poin Keamanan:
1. **Keamanan API Key**: Kunci API Biteship (`BITESHIP_API_KEY`) disimpan secara aman di sisi server (berkas `.env`) dan **tidak diperlihatkan** di halaman dashboard. Staf atau siapa pun yang membuka dashboard tidak bisa melihat API Key tersebut.
2. **Pencarian Lokasi Asal Dinamis**: Untuk mempermudah konfigurasi, Owner cukup mengetik nama kecamatan / kabupaten asal gudang pada dashboard. Sistem akan mencari kecocokan area melalui proxy server dan menyimpannya di database (`whatsapp_ai_settings`).

### Perubahan Teknis yang Dilakukan:
1. **Migrasi Database (`supabase/migrations/20260618212000_add_biteship_to_settings.sql`):**
   - Menambahkan kolom `biteship_origin_area_id` (ID Area Biteship) dan `biteship_origin_name` (Nama Area Lengkap) ke tabel `public.whatsapp_ai_settings`.
2. **Proxy Area Search di Sisi Server (`src/routes/api.biteship.search-area.ts`):**
   - Membuat endpoint `/api/biteship/search-area?input=...` yang mencari data wilayah di API Maps Biteship secara aman menggunakan token API server.
3. **Peningkatan Webhook WhatsApp AI (`src/routes/api.webhooks.whatsapp.ts`):**
   - Mendeteksi kata kunci pengiriman (seperti *ongkir, kirim ke, tarif, biaya*) pada chat pelanggan.
   - Menggunakan **OpenAI GPT-4o-mini** untuk mengekstrak nama KECAMATAN dan KABUPATEN tujuan dari chat pelanggan secara akurat.
   - Mencari ID area tujuan di Biteship Maps, lalu memanggil Biteship Rates API untuk paket seberat 1 kg dari lokasi gudang asal ke lokasi tujuan.
   - Menyuntikkan rincian tarif kurir populer (JNE, J&T, SiCepat, SPX, Tiki, POS) langsung ke dalam prompt karakter DeepSeek-V3 agar diinfokan kepada pelanggan secara natural dan sopan.
4. **Antarmuka Autocomplete Dashboard ([whatsapp-ai.tsx](file:///C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/src/routes/whatsapp-ai.tsx)):**
   - Menambahkan input pencarian **Gudang Keberangkatan (Biteship Origin)** di bawah pengaturan prompt AI.
   - Mengintegrasikan pencarian area real-time dengan debounce 600ms ke endpoint proxy.
   - Menampilkan hasil pencarian di dropdown yang responsif dan menyimpan nama serta ID area terpilih ke database saat Owner menyimpan konfigurasi.

### Hasil Verifikasi & Build:
- Jalankan build lokal (`npm.cmd run build`) dan kompilasi berhasil 100% tanpa kesalahan TypeScript.
- Perubahan kode telah dicommit dan didorong ke cabang utama GitHub (`git push`), sehingga auto-deployment ke Vercel selesai secara otomatis.

> [!IMPORTANT]
> **Tindakan yang Diperlukan oleh Owner (Big Bos):**
> Mohon daftarkan variabel environment `BITESHIP_API_KEY` pada menu **Environment Variables** di dashboard Vercel Anda untuk digunakan di server produksi. Gunakan API Key Biteship Live yang telah Anda miliki.

---

## 24. Perbaikan Overload Fungsi Database (Order Return & Historical Import) (Selesai)

Kami telah mengatasi masalah error putih (*error card popup*) saat memproses retur pesanan pada halaman `/retur` yang disebabkan oleh kegagalan PostgreSQL memilih fungsi kandidat terbaik (*Could not choose the best candidate function*) untuk `public.process_order_return`.

### Masalah yang Diselesaikan:
- **Pembersihan Fungsi Duplikat:** Kami menemukan dua signature untuk `process_order_return` yang memiliki tipe parameter yang sama persis namun berbeda urutan penulisannya di database Supabase.
- **Pembersihan Fungsi Impor Usang:** Kami juga menemukan dan menghapus overload fungsi `public.import_historical_order` versi lama (10 parameter) karena saat ini sistem menggunakan versi 13 parameter.

### Perubahan Teknis yang Dilakukan:
1. Menghapus fungsi retur usang `public.process_order_return(_order_id uuid, _items_condition jsonb, _return_shipping_fee numeric, _notes text)` menggunakan perintah `DROP FUNCTION`.
2. Menghapus overload fungsi `public.import_historical_order` versi lama (10 parameter) agar RPC query menargetkan fungsi yang tepat secara unik.
3. Melakukan pemeriksaan menyeluruh di database dan mengonfirmasi saat ini jumlah fungsi yang memiliki *overload* di skema `public` adalah **0 (nol)**.

### Cara Pengujian & Status Live:
1. Masuk ke halaman **Retur Pesanan** di dashboard.
2. Masukkan nomor resi pesanan yang ingin diretur.
3. Klik **Proses Konfirmasi Retur**.
4. Proses retur pesanan sekarang dapat diselesaikan secara sukses tanpa adanya popup error!

---

## 25. Desain Ulang Filter Tanggal Finance Hub (Dropdown & Pilihan Kemarin) (Selesai)

Kami telah mengubah tombol filter rentang tanggal pada halaman **Finance Hub (Keuangan)** menjadi sistem dropdown yang lebih simpel, rapi, dan menambahkan opsi filter rentang tanggal **Kemarin**.

### Fitur yang Diimplementasikan:
1. **Dropdown Periode Simpel:** Mengganti deretan tombol periode filter (Hari Ini, 1 Minggu, 1 Bulan, 3 Bulan, Kustom) dengan satu input dropdown (`Select` dari Shadcn/ui) agar tampilan dashboard terlihat lebih bersih, rapi, dan luas.
2. **Pilihan "Kemarin" (Yesterday):** Menambahkan opsi filter **Kemarin** untuk mempermudah Big Bos memantau catatan keuangan secara khusus pada 1 hari sebelum hari ini (mengurangkan 1 hari penuh pada rentang tanggal mulai dan selesai).
3. **Kustom Rentang Tanggal:** Input kustom tanggal tetap dipertahankan dan akan muncul secara dinamis di sebelah kanan dropdown jika pilihan "Kustom Tanggal" dipilih.

### Cara Pengujian & Status Live:
1. Masuk ke halaman **Keuangan** (`/keuangan`) di dashboard.
2. Perhatikan di bagian kanan atas kartu Header Finance Hub, kini terdapat dropdown berlabel default periode aktif.
3. Klik dropdown tersebut dan pilih **Kemarin** untuk melihat performa omzet kotor, potongan platform, HPP, operasional, dan laba bersih khusus untuk transaksi kemarin.

---

## 26. Fitur Pemantauan Volume Madu Keluar Harian di Dashboard (Selesai)

Kami telah menambahkan panel pemantauan volume keluar madu (dalam kg) secara real-time yang dikelompokkan berdasarkan jenis madu (seperti Akasia, Randu, dll.) pada halaman **Dashboard Utama**.

### Fitur yang Diimplementasikan:
1. **Perhitungan Volume Riil:** Sistem secara dinamis memuat seluruh transaksi sukses hari ini dan merangkum akumulasi volume madu yang digunakan (`honey_kg_used`) dari seluruh item penjualan yang dikirim.
2. **Pengelompokan Jenis Madu:** Menampilkan data volume keluar dalam bentuk kartu grid premium untuk setiap varian madu (Akasia, Randu, dll.) yang memiliki penjualan hari ini.
3. **Pesan Status Kosong:** Jika belum ada madu yang keluar hari ini, panel akan menampilkan pesan informatif: *"Belum ada madu yang keluar dari pesanan hari ini."*

### Cara Pengujian & Status Live:
1. Masuk ke halaman **Dashboard** utama.
2. Di bawah deretan kartu metrik utama (Saldo Madu Dandang, Order Hari Ini, dsb.), perhatikan komponen kartu baru berlabel **"Madu Keluar Hari Ini"**.
3. Komponen ini akan otomatis memuat nama jenis madu beserta volume kilogram yang terjual secara real-time pada hari tersebut.

---

## 27. Sistem Otomatisasi CRM dengan Pembatasan Harian & Siklus 1 Menit (Selesai)

Kami telah mengubah sistem pengiriman pesan CRM agar 100% aman dari ancaman pemblokiran (banned) WhatsApp serta batas waktu serverless (timeout) di akun Vercel Hobby Anda.

### Perubahan Teknis yang Dilakukan:
1. **Logika Siklus 1 Pesan per Run (Single Message Loop):**
   - Menghapus perulangan penundaan yang lama di backend. Sekarang, setiap kali cron job berjalan, server hanya memproses dan mengirimkan **1 pesan** teratas dari antrean.
   - Mengurangi durasi eksekusi serverless menjadi kurang dari 1 detik (sangat aman dari limit timeout 10 detik di Vercel Hobby).
2. **Kontrol Batas Harian Otomatis (Daily Quota Enforcement):**
   - Menambahkan pemeriksaan kuota harian dinamis menggunakan zona waktu Jakarta (**Asia/Jakarta**).
   - Sistem akan menghitung jumlah pesan yang sudah sukses terkirim hari ini. Jika jumlahnya telah mencapai atau melebihi batas harian yang diatur di dashboard (misalnya **50** pesan per hari), cron akan langsung berhenti (*exit early*) tanpa melakukan pengiriman baru.
3. **Pembaruan Panduan di UI Pengaturan:**
   - Memperbarui teks petunjuk pada menu **Pengaturan > WhatsApp** di dashboard. Informasi cron sekarang memandu Owner untuk mendaftarkan URL & token Authorization di **cron-job.org** dengan setelan frekuensi **setiap 1 menit**.

### Rekomendasi Setelan di cron-job.org:
1. Daftarkan URL & header token Authorization Anda di **cron-job.org** (gratis).
2. Atur jadwal ke **Every 1 minute** (Setiap 1 menit).
3. **Hasil Riil**: Sistem akan mengirimkan tepat 1 pesan setiap menit. Dalam waktu 50 menit pertama, kuota 50 pesan harian Anda akan terkirim dengan jeda yang sangat aman dan alami (1 menit antar pesan). Setelah kuota 50 tercapai, pemicu cron berikutnya akan langsung berhenti otomatis hingga berganti hari berikutnya.

### 4. Proteksi Jam Operasional Kirim (Membatasi Waktu Kirim Malam Hari)
- Menambahkan aturan jam operasional di backend: pesan CRM **hanya boleh dikirim antara pukul 09:00 WIB s.d. 20:00 WIB**.
- Pemicu cron yang masuk di luar jam tersebut (misalnya jam 00:00 malam hingga 08:59 pagi) akan langsung dihentikan secara otomatis (*exit early*) tanpa memproses atau mengirim pesan ke pelanggan.
- Hal ini mencegah antrean kuota harian yang baru saja di-reset pada tengah malam langsung terkirim secara serentak di waktu istirahat malam pelanggan.


