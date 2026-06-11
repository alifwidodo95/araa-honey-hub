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
