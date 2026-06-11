# Migrasi ke Supabase Pribadi (Lepas dari Lovable)

Memindahkan koneksi database aplikasi Araa Honey Hub dari Supabase bawaan Lovable ke proyek Supabase pribadi milik Big Bos (`seefgyiloalpiqfrglqo`), dengan menyalin 100% data lama agar tidak ada yang hilang.

## User Review Required

> [!IMPORTANT]
> - **Langkah Penyelamatan Data:** Karena database Lovable tidak bisa diakses langsung lewat pg_dump eksternal tanpa password, kita akan meminta Lovable untuk mengekspor seluruh data tabel sebagai **SQL INSERT statements** (data dump).
> - **Kredensial Supabase Baru:** Big Bos perlu menyiapkan **Project URL** dan **Anon/Publishable Key** dari proyek Supabase pribadi Anda untuk dimasukkan ke file `.env` lokal.

## Proposed Changes

### Database & Konfigurasi

#### [NEW] `migrate_schema.sql`
Membuat file SQL gabungan dari seluruh berkas migrasi skema tabel di folder `supabase/migrations/` secara berurutan.

#### [MODIFY] `.env`
Mengubah kredensial Supabase agar mengarah ke proyek pribadi Anda:
```env
SUPABASE_PROJECT_ID="seefgyiloalpiqfrglqo"
SUPABASE_URL="https://seefgyiloalpiqfrglqo.supabase.co"
SUPABASE_PUBLISHABLE_KEY="[Anon Key Proyek Pribadi Big Bos]"

VITE_SUPABASE_PROJECT_ID="seefgyiloalpiqfrglqo"
VITE_SUPABASE_URL="https://seefgyiloalpiqfrglqo.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="[Anon Key Proyek Pribadi Big Bos]"
```

---

## Plan Jalur Migrasi (Step-by-Step)

1. **Pembuatan Schema:** Jarvis akan membuat file `migrate_schema.sql` di folder aplikasi.
2. **Penerapan Schema Baru:** Big Bos menyalin isi `migrate_schema.sql` dan menjalankannya di SQL Editor Supabase pribadi Anda (`seefgyiloalpiqfrglqo`).
3. **Ekspor Data dari Lovable:** Big Bos meminta Lovable untuk memformat data yang ada saat ini menjadi SQL INSERT.
4. **Impor Data Ke Supabase Baru:** Big Bos menjalankan SQL INSERT tersebut di SQL Editor Supabase pribadi Anda.
5. **Update .env:** Big Bos mengupdate file `.env` lokal dengan kredensial baru.
6. **Verifikasi:** Menjalankan aplikasi secara lokal dan memverifikasi semua data terisi dengan benar.
