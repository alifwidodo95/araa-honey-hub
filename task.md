# Task List: Migrasi Database ke Supabase Pribadi

- [x] Buat file `migrate_schema.sql` gabungan dari seluruh migration files
- [x] Ekstrak dan migrasikan data secara otomatis dari database lama ke database baru
- [x] Masukkan schema dan data ke database Supabase pribadi baru
- [x] Perbarui `.env` dengan kredensial database Supabase pribadi baru
- [x] Restart dev server dan verifikasi aplikasi berjalan normal dengan database baru
- [x] Implementasi dan verifikasi filter rentang tanggal (Hari Ini, 1 Minggu, 1 Bulan, 3 Bulan, Kustom Tanggal) di halaman Keuangan
- [x] Implementasi input jenis madu kustom secara bebas (autosinkronisasi harga & dandang) di halaman Bahan Baku
- [x] Pembatasan antrean kirim resi otomatis WhatsApp hanya untuk pesanan saluran penjualan WhatsApp (Meta Ads)

# Task List: Fitur Hapus/Undo Transaksi Retur

- [x] Buat fungsi database `delete_order_return` untuk melakukan rollback stok dan pengeluaran terkait
- [x] Tambahkan kolom Aksi dan tombol Hapus (Trash icon) pada riwayat retur di `retur.tsx`
- [x] Implementasi dialog konfirmasi sebelum penghapusan
- [x] Hubungkan tombol Hapus dengan RPC `delete_order_return` di Supabase
- [x] Uji kompilasi build lokal (`npm run build`)
- [x] Deploy ke server produksi Vercel (`app.araahoney.my.id`)

# Task List: Pilihan Ekspedisi & Metode Pembayaran pada Input Pesanan

- [x] Tambah kolom `expedition` dan `payment_method` di tabel `public.orders`
- [x] Perbarui fungsi database `create_order` (11 argumen) untuk menyimpan nilai ekspedisi dan metode pembayaran
- [x] Tambahkan state dan helper `detectCourier` di `penjualan.tsx`
- [x] Tambahkan dropdown pilihan Ekspedisi dan Metode Pembayaran di form input pesanan
- [x] Hubungkan input No. Resi dengan auto-detection courier (`SPX...` -> SPX, `ID...`/`IDE...` -> ID EXPRESS)
- [x] Tampilkan detail metode pembayaran dan ekspedisi di bawah nama channel di tabel riwayat pesanan
- [x] Tambahkan field Ekspedisi dan Metode Pembayaran di modal Edit Pesanan
- [x] Uji kompilasi build lokal (`npm run build`)
- [x] Deploy ke server produksi Vercel (`app.araahoney.my.id`)

# Task List: Rekening Bank untuk Metode Pembayaran Transfer

- [x] Tambah kolom `transfer_bank` di tabel `public.orders`
- [x] Perbarui fungsi database `create_order` (12 argumen) untuk menyimpan nilai bank transfer
- [x] Tambahkan state `transferBank` and `editTransferBank` di `penjualan.tsx`
- [x] Tambahkan dropdown pilihan Rekening Bank (BRI, BCA, MANDIRI, BNI, BSI) di form input pesanan jika metode TRANSFER dipilih
- [x] Tampilkan detail bank transfer di samping metode pembayaran di tabel riwayat pesanan (contoh: `TRANSFER (BCA)`)
- [x] Tambahkan field Rekening Bank di modal Edit Pesanan jika metode TRANSFER dipilih
- [x] Uji kompilasi build lokal (`npm run build`)
- [x] Deploy ke server produksi Vercel (`app.araahoney.my.id`)

# Task List: Akumulasi Metode Pembayaran di Halaman Keuangan

- [x] Tambahkan kalkulasi omzet kotor & jumlah pesanan untuk COD, TRANSFER, dan CASH di `keuangan.tsx`
- [x] Tambahkan modul Card "Akumulasi Metode Pembayaran" dengan visualisasi progress bar proporsional
- [x] Impor ikon Truck, CreditCard, dan Banknote di `keuangan.tsx`
- [x] Pastikan data ter-update secara dinamis mengikuti filter rentang tanggal
- [x] Uji kompilasi build lokal (`npm run build`)
- [x] Deploy ke server produksi Vercel (`app.araahoney.my.id`)

# Task List: Proxy WAHA & Mixed Content Fix

- [x] Buat file handler API `/api/waha-proxy` di `src/routes/api.waha-proxy.ts`
- [x] Sesuaikan call API di `src/routes/pengaturan.whatsapp.tsx` untuk menggunakan `/api/waha-proxy`
- [x] Verifikasi hasil build lokal (`npm run build`)
- [x] Commit dan infokan ke Big Bos untuk dideploy ke Vercel

- [x] Edit `src/routes/pengaturan.whatsapp.tsx` untuk kustomisasi template follow-up
  - [x] Tambahkan state `followUpTemplate` dan ref `followUpTextareaRef` (atau sesuaikan helper kursor)
  - [x] Implementasikan sinkronisasi Supabase di `useEffect` dan `handleSaveConfig`
  - [x] Tambahkan tab header toggle ("Kirim Resi" vs "Follow Up Retur") di UI Template Pesan
  - [x] Render input, badge placeholder, dan live preview sesuai tab aktif
- [x] Edit `src/routes/retur.tsx` untuk mengirim pesan follow-up otomatis
  - [x] Tambahkan useQuery `waha-config` untuk memuat data konfigurasi
  - [x] Tambahkan fungsi helper `sendFollowUpMessage` yang mengirim pesan lewat proxy
  - [x] Picu pengiriman pesan otomatis di blok sukses `processReturn` menggunakan `toast.promise`
- [x] Verifikasi perubahan dengan kompilasi build
- [x] Deploy hasil terbaru ke production (Vercel)

# Task List: Pemetaan Kolom Excel Impor Riwayat

- [x] Implementasikan fungsi `detectColumnHeader` untuk pencocokan kolom persis (exact match) kemudian sebagian (partial match)
- [x] Tambahkan parameter `defval: ""` pada parser `XLSX.utils.sheet_to_json` untuk mencegah pergeseran indeks baris kosong
- [x] Tingkatkan ketahanan fungsi helper `getVal` dengan mendukung format array dan objek secara dinamis
- [x] Sinkronisasi kata kunci pencarian kolom untuk Lincah dan SPX
- [x] Verifikasi kompilasi build lokal (`npm run build`)
- [x] Deploy ke server produksi Vercel (`app.araahoney.my.id`)

# Task List: Kursor Lebah Interaktif Premium

- [x] Buat file komponen kustom `src/components/bee-cursor.tsx`
- [x] Daftarkan `@keyframes honey-drop` di `src/styles.css`
- [x] Integrasikan `<BeeCursor />` ke `src/components/app-layout.tsx`
- [x] Tambahkan sakelar On/Off kustomisasi kursor lebah di `src/routes/pengaturan.profil.tsx`
- [x] Jalankan build lokal (`npm run build`) untuk verifikasi kompilasi
- [x] Deploy hasil terbaru ke Vercel (`app.araahoney.my.id`) dan uji coba

# Task List: Stiker & Kemasan Beda Varian Madu (Akasia & Randu)

- [x] Jalankan migrasi SQL untuk menambahkan kolom `honey_type` dan memperbarui unique constraint serta RPC `create_order` & `import_historical_order`
- [x] Modifikasi `src/routes/stok.kemasan.tsx`:
  - [x] Fetch data `honey_variants`
  - [x] Tambahkan dropdown pilihan **Varian Madu (opsional)** di modal Tambah Item Kemasan
  - [x] Kirim `honey_type` pada payload saat menyisipkan item kemasan baru
  - [x] Tampilkan badge varian madu di samping nama item pada tabel stok
- [x] Jalankan build lokal (`npm.cmd run build`) untuk verifikasi kompilasi
- [x] Deploy ke Vercel production (`app.araahoney.my.id`)

# Task List: Format Desimal Stok & Edit Stok Manual

- [x] Sembunyikan desimal .00 yang tidak diperlukan dengan `parseFloat(Number(val).toFixed(2))`
- [x] Buat input edit stok manual secara inline pada kolom Stok
- [x] Hubungkan input edit stok dengan update database Supabase `packaging_items` pada event `onBlur`
- [x] Jalankan build lokal (`npm.cmd run build`) untuk verifikasi kompilasi
- [x] Commit dan push perubahan ke GitHub (`git push`) untuk trigger auto-deployment Vercel

# Task List: Segel Varian Madu (Segel Hitam vs Segel Emas)

- [x] Buat file migrasi database `supabase/migrations/20260613132500_variant_aware_seals.sql` untuk memperbarui fungsi `create_order`, `import_historical_order`, `process_order_return`, dan `delete_order_return`
- [x] Cari segel secara dinamis per item pesanan berdasarkan varian madunya di seluruh RPC
- [x] Perbaiki pemulihan stok botol dan stiker spesifik varian saat transaksi retur diproses/dibatalkan
- [x] Terapkan migrasi SQL tersebut ke database Supabase pribadi
- [x] Modifikasi `src/routes/stok.kemasan.tsx` untuk menampilkan pilihan Varian Madu pada tipe `segel`
- [x] Jalankan build lokal (`npm.cmd run build`) untuk verifikasi kompilasi
- [x] Commit dan push perubahan ke GitHub untuk memicu auto-deployment di Vercel

# Task List: Perbaikan Konfigurasi SUPABASE_SERVICE_ROLE_KEY & Akun Staf

- [x] Identifikasi error SUPABASE_SERVICE_ROLE_KEY yang hilang di dashboard Vercel
- [x] Daftarkan SUPABASE_SERVICE_ROLE_KEY di Vercel menggunakan set-vercel-env.js API script
- [x] Tambahkan SUPABASE_SERVICE_ROLE_KEY ke berkas .env lokal
- [x] Commit dan push pembaruan dokumentasi ke GitHub untuk memicu redeployment Vercel

# Task List: Custom Role & Permission Builder (RBAC Dinamis)

- [x] Buat file migrasi database `supabase/migrations/20260613140500_rbac_dynamic_roles.sql` untuk memperbarui tipe kolom user_roles.role ke TEXT, has_role, current_role_label, dan default permissions
- [x] Terapkan migrasi SQL tersebut ke database Supabase pribadi
- [x] Modifikasi `src/lib/auth-context.tsx` untuk mendukung dynamic Role string, memuat permission, dan menyediakan hasPermission helper
- [x] Modifikasi `src/components/require-auth.tsx` untuk validasi `requiredPermission`
- [x] Modifikasi `src/components/app-layout.tsx` untuk memfilter tautan navigasi berdasarkan permission
- [x] Modifikasi `src/routes/dashboard.tsx` untuk memfilter Omzet & Grafik keuangan menggunakan hasPermission("keuangan")
- [x] Modifikasi seluruh route halaman admin lainnya agar menggunakan requiredPermission yang tepat
- [x] Modifikasi `src/routes/pengaturan.staf.tsx` untuk dropdown role dinamis, inline role edit/swap, dan Panel RBAC Permission Builder (tambah role, centang izin, simpan ke database)
- [x] Jalankan build lokal (`npm.cmd run build`) untuk verifikasi kompilasi
- [x] Update walkthrough.md dengan dokumentasi fitur RBAC baru

# Task List: Fitur Komentar Iklan & AI Auto-Reply

- [x] Jalankan migrasi SQL untuk membuat tabel `meta_comments`, `meta_posts` dan registrasi RBAC permission `meta-comments`
- [x] Buat API server route `/api/webhooks/meta-comments` untuk menerima dan membalas komentar Meta Graph API
- [x] Integrasikan OpenAI API dengan system prompt dinamis menggunakan data harga dari database dan settingan custom prompt
- [x] Buat API server route `/api/meta/sync-comments` untuk sinkronisasi komentar manual
- [x] Update `src/components/app-layout.tsx` untuk menambahkan tautan "Komentar Iklan" ke sidebar
- [x] Buat page route `src/routes/meta-comments.tsx` dengan 3 tab (Facebook, Instagram, Pengaturan AI)
- [x] Jalankan build lokal (`npm.cmd run build`) untuk verifikasi kompilasi

# Task List: Optimalisasi Sinkronisasi Komentar FB & Ad Creatives (Paging Komentar Lengkap)

- [x] Tingkatkan limit Ad Creatives ke 150 dan feed posts ke 50 di `api.meta.sync-comments.ts`
- [x] Implementasikan pagination penarikan seluruh komentar secara lengkap menggunakan `filter=stream` dan `order=reverse_chronological` di `api.meta.sync-comments.ts`
- [x] Tambahkan pengecekan duplikasi pintar (smart stop) untuk mempercepat proses sinkronisasi komentar lama
- [x] Jalankan build lokal (`npm run build`) untuk memastikan tidak ada kesalahan kompilasi
- [x] Lakukan verifikasi manual menggunakan script pengetesan sync lokal
- [x] Buat walkthrough untuk merangkum hasil kerja dan verifikasi perbaikan komentar

# Task List: Integrasi Asisten WhatsApp AI (DeepSeek)

- [x] Buat file migrasi database `supabase/migrations/20260618203500_whatsapp_ai_bot.sql` dan eksekusi
- [x] Buat file handler webhook `/api/webhooks/whatsapp`
- [x] Buat page route `/whatsapp-ai` untuk mengelola setelan, prompt, FAQ, dan riwayat chat log
- [x] Hubungkan menu Asisten WA AI ke sidebar dan batasi akses menggunakan RBAC permissions
- [x] Jalankan build lokal (`npm.cmd run build`) untuk verifikasi kompilasi
- [x] Deploy ke server produksi Vercel (`app.araahoney.my.id`)

