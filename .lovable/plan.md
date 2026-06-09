
# Araa Honey – Aplikasi Manajemen Bisnis Terintegrasi

SPA berbasis TanStack Start + Lovable Cloud (Supabase) dengan sidebar slate profesional, dark mode, RBAC owner/staf, 2FA email OTP untuk owner, auto-deduct inventory, dan finance hub eksklusif owner.

## 1. Stack & Setup

- TanStack Start (sudah ada), Tailwind v4, shadcn/ui, Recharts (Area/Line chart), Framer Motion (opsional micro-interaction).
- Lovable Cloud (Supabase) untuk auth, database, RLS, scheduled job (pg_cron) untuk lumpsum bulanan & pengiriman OTP via Resend (atau Supabase Auth email).
- Sesi persisten default Supabase (`persistSession: true`) – sudah terpenuhi.

## 2. Routing & Entry Point

```
src/routes/
  index.tsx                  -> redirect ke /auth (kalau belum login) atau /dashboard
  auth.tsx                   -> form login (email+password). Tidak ada link register.
  auth.otp.tsx               -> step 2FA OTP untuk owner
  _authenticated/route.tsx   -> gate (ssr:false, redirect /auth)
  _authenticated/index.tsx   -> redirect ke /dashboard
  _authenticated/dashboard.tsx (staff & owner – versi berbeda by role)
  _authenticated/penjualan.tsx
  _authenticated/stok/bahan-baku.tsx
  _authenticated/stok/pindah-wadah.tsx
  _authenticated/stok/kemasan.tsx
  _authenticated/stok/packing.tsx
  _authenticated/pengeluaran/operasional.tsx
  _authenticated/_owner/route.tsx        -> gate role=owner
  _authenticated/_owner/keuangan.tsx     -> Finance Hub (laba bersih, grafik)
  _authenticated/_owner/pengeluaran-pribadi.tsx
  _authenticated/_owner/pengaturan/harga.tsx       (harga retail + tier reseller)
  _authenticated/_owner/pengaturan/marketplace.tsx (% Shopee/TikTok)
  _authenticated/_owner/pengaturan/lumpsum.tsx     (utilitas bulanan)
  _authenticated/_owner/pengaturan/staf.tsx        (CRUD akun staf)
  _authenticated/_owner/pengaturan/keamanan.tsx    (2FA toggle)
```

Sidebar otomatis menyembunyikan menu owner dari staf (driven by `has_role`).

## 3. Database Schema (Supabase)

Enum: `app_role` = `owner | staff`.

Tabel inti (semua RLS aktif, GRANT ke authenticated):

- `profiles` (id=auth.users, full_name, created_at)
- `user_roles` (user_id, role)  → akses via security-definer `has_role()`
- `owner_2fa` (user_id, otp_hash, otp_expires_at, last_verified_at)  – OTP email
- `app_settings` (key, value jsonb)  – persen Shopee/TikTok, lumpsum kas pribadi
- `product_sizes` (id, name "1kg/500/250/130/100", weight_grams)
- `retail_prices` (size_id, price)
- `reseller_tiers` (id, name "Silver/Gold/Platinum", active)
- `reseller_prices` (tier_id, size_id, price)
- `marketplace_channels` (id, name, fee_percent, allow_manual_fee)
- **Inventory**
  - `raw_material_lots` (id, received_at, jerigen_qty=1, kg_per_jerigen=50, price_total, price_per_kg generated)
  - `raw_material_stock` (jerigen_on_hand)  – atau dihitung view
  - `dandang_balance` (id singleton, kg_remaining)
  - `dandang_transfers` (id, lot_id, jerigen_opened, kg_added, avg_cost_at_transfer, created_by, created_at)
  - `packaging_items` (id, type enum [botol|stiker|segel|bubblewrap|lakban|kardus], size_id nullable, unit, current_stock, avg_cost)
  - `packaging_purchases` (id, item_id, qty, total_price, unit_cost generated, purchased_at, recorded_by) – juga dipakai sebagai EXPENSE bubble wrap/kardus (jawaban user)
- **Sales**
  - `sales_channels` enum
  - `orders` (id, channel, customer_note, subtotal_gross, marketplace_fee, shipping_fee, net_revenue, cogs_total, created_by, created_at, reseller_tier_id nullable)
  - `order_items` (id, order_id, size_id, qty, unit_price, line_total, honey_kg_used, cogs_line)
- **Expenses**
  - `expenses_business` (id, category [meta_ads|gaji|packaging_purchase|other], amount, note, occurred_on, created_by)
  - `expenses_personal` (id, category, amount, note, occurred_on, owner_id) – owner only
  - `lumpsum_rules` (id, label "Listrik/Air/Internet", monthly_amount, active)
  - `lumpsum_postings` (id, rule_id, period_month, amount, posted_at)  – diisi cron

Average Costing dihitung lewat trigger / fungsi: saat pindah wadah ambil weighted avg dari lot aktif; saat order ambil avg dandang.

## 4. Logic Inti

### Auto-deduct saat order
Server fn `createOrder({channel, items[], tier?, manual_shipping_fee?})`:
1. Validasi stok (dandang kg, botol, stiker per size, segel, bubble, lakban, kardus).
2. Hitung `honey_kg_used = Σ(size.weight_grams * qty)/1000`.
3. Kurangi: dandang_balance, packaging botol+stiker+segel sesuai size & qty, allocate kardus + bubble + lakban (rasio tetap per ukuran yang disimpan di `app_settings.packaging_allocation`). *(Catatan user: bubble & kardus tetap dipotong stok tapi nilainya sudah terexpense di pembelian → masuk COGS lewat avg_cost packaging.)*
4. Hitung harga = retail atau reseller_tier; fee marketplace otomatis; WA pakai `manual_shipping_fee`.
5. Insert order + order_items + stock movements (audit trail).

### Pindah Wadah
Server fn `openJerigen({lot_id})` → jerigen_on_hand-=1, dandang_balance.kg+=50, catat avg cost saat transfer.

### Lumpsum scheduled
pg_cron tanggal 1 jam 00:05 → untuk tiap rule active insert `lumpsum_postings` + `expenses_business` (kategori lumpsum) & `expenses_personal` (income to owner). Idempoten via unique (rule_id, period_month).

### 2FA Owner
Login email/password → jika role=owner, server fn generate 6-digit OTP, hash bcrypt, kirim via Supabase email (Resend). Halaman `/auth/otp` verifikasi → set `owner_2fa.last_verified_at` & set cookie sesi 2FA (httpOnly via Tanstack server). Middleware `requireOwner2FA` cek cookie sebelum boleh akses route `_owner/*`.

## 5. Finance Hub (Owner Only)

Server fn `getFinanceSummary({from,to})`:
- Pendapatan kotor = Σ subtotal_gross
- Potongan platform = Σ marketplace_fee + shipping_fee
- COGS = Σ cogs_total (madu avg + botol+stiker+segel+alokasi packing avg)
- Operasional = Σ expenses_business (meta_ads, gaji, lumpsum_business_side)
- **Laba Bersih** = formula yang user minta.
- ROAS harian: omzet WA hari X / meta_ads hari X.

Visual: Area chart tren laba harian, Line chart ROAS, kartu metrik (omzet, HPP, laba, margin %).

## 6. UI/UX

- Sidebar vertikal slate-900 dengan accent madu (amber-500) sebagai highlight active.
- Konten putih bersih (mode terang) / slate-950 (dark).
- Toggle dark mode di topbar (persist localStorage, kelas `.dark` di html).
- Komponen kartu metrik shadcn `Card` + ikon lucide.
- Grafik Recharts Area/Line.
- Tabel data shadcn `Table` + pagination.
- Form input pakai `react-hook-form` + zod.

## 7. Tahapan Implementasi

1. **Enable Lovable Cloud** + migrasi schema + RLS + GRANT + has_role + seed (5 ukuran botol, channel default, lumpsum kosong).
2. Layout shell: sidebar, topbar, dark mode toggle, auth gate (manage `_authenticated` & `_owner`).
3. Login flow + email OTP 2FA owner.
4. Modul Stok: bahan baku (lot + harga), pindah wadah, kemasan & packing (input pembelian = sekaligus expense).
5. Modul Penjualan: form order multi-channel dengan auto-deduct + kalkulator fee.
6. Modul Pengeluaran: operasional (staf+owner) & pribadi (owner).
7. Pengaturan owner: harga retail, tier reseller (Silver/Gold/dst), persen marketplace, rules lumpsum, akun staf, 2FA.
8. Cron lumpsum bulanan (pg_cron).
9. Finance Hub dashboard owner (formula laba bersih, grafik tren, ROAS).
10. Dashboard staf (ringkasan operasional non-finansial: stok rendah, order hari ini, total kg dandang).
11. QA: cek RLS, role gating, auto-deduct edge cases, dark mode.

## 8. Klarifikasi yang Sudah Dijawab User

- 2FA: Email OTP saja.
- Bubble wrap & kardus: tidak dialokasikan per pcs dari sudut biaya — pembelian dicatat sekali sebagai expense (sekaligus menambah stok pcs). Auto-deduct tetap mengurangi stok pcs agar tahu kapan habis, **tapi tidak menambah COGS per order** (karena sudah expense di awal). Saya akan terapkan persis seperti ini.
- Harga reseller: multi-tier (Silver/Gold/Platinum – tier bisa di-CRUD owner).
- Lumpsum: pg_cron otomatis tanggal 1.

## 9. Hal yang Tidak Termasuk MVP (bisa ditambah nanti)

- Export PDF/Excel laporan.
- Integrasi API langsung Shopee/TikTok (saat ini input manual order).
- Notifikasi WhatsApp / email broadcast.
- Multi-cabang / multi-gudang.

Jika setuju, saya akan implementasi mulai dari aktivasi Lovable Cloud + schema, lalu shell UI, lalu modul-modul berurutan.
