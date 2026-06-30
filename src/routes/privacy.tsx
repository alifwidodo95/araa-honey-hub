import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: PrivacyPolicy });

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-extrabold text-slate-900 mb-6 border-b pb-4">
          Kebijakan Privasi Araa Honey Hub
        </h1>
        
        <p className="text-sm text-slate-500 mb-8">
          Terakhir diperbarui: 30 Juni 2026
        </p>

        <section className="space-y-6 text-slate-700 leading-relaxed">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">1. Pendahuluan</h2>
            <p>
              Araa Honey Hub berkomitmen untuk melindungi privasi data pengguna dan pelanggan kami. Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, dan melindungi informasi Anda ketika Anda menggunakan aplikasi kami dan layanan integrasi media sosial kami (termasuk Facebook Page dan Instagram).
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">2. Informasi yang Kami Kumpulkan</h2>
            <p>
              Kami mengumpulkan informasi ketika Anda berinteraksi dengan layanan kami, termasuk:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Data Komentar:</strong> Kami membaca isi komentar, nama pengguna, dan ID komentar pada postingan halaman Facebook dan akun Instagram Anda guna menyediakan layanan balasan otomatis berbasis kecerdasan buatan (AI).</li>
              <li><strong>Data Kontak & Transaksi:</strong> Informasi pelanggan seperti nama, nomor telepon, dan nomor resi pengiriman untuk kebutuhan manajemen internal toko.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">3. Penggunaan Informasi</h2>
            <p>
              Informasi yang dikumpulkan hanya digunakan untuk:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Memproses dan menjawab komentar pelanggan secara otomatis di Facebook dan Instagram.</li>
              <li>Membantu operasional toko Araa Honey dalam mengirimkan resi pengiriman otomatis.</li>
              <li>Meningkatkan pengalaman dan kualitas pelayanan pelanggan kami.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">4. Perlindungan dan Berbagi Data</h2>
            <p>
              Kami sangat menjaga kerahasiaan data Anda. Kami tidak akan pernah menjual, menyewakan, atau membagikan data pribadi pengguna kepada pihak ketiga di luar kebutuhan fungsionalitas integrasi resmi API Meta (Facebook & Instagram).
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">5. Hak Pengguna</h2>
            <p>
              Anda memiliki hak penuh untuk memutuskan sambungan akses aplikasi kami dari akun Facebook atau Instagram Anda kapan saja melalui pengaturan integrasi di aplikasi atau melalui portal keamanan akun Facebook Anda.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">6. Kontak Kami</h2>
            <p>
              Jika Anda memiliki pertanyaan tentang Kebijakan Privasi ini, silakan hubungi kami melalui email resmi atau kontak layanan pelanggan Araa Honey.
            </p>
          </div>
        </section>

        <div className="mt-12 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Araa Honey. Semua hak dilindungi undang-undang.
        </div>
      </div>
    </div>
  );
}
