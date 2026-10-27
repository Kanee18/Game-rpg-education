# ⚔️ Petualangan Melawan Raja Iblis — Modul Ajar Berbasis Game Web

Game kuis kelas bergaya **RPG anime isekai**. Layar guru (proyektor/TV) menampilkan party petualang
yang berisi karakter seluruh siswa (maksimal **20**). Siswa memindai QR, mengisi nama, memilih salah satu
dari **7 karakter**, lalu HP mereka berubah menjadi tombol **A / B / C / D** untuk menjawab soal.

- Jawaban **benar** → karakter menyerang musuh (animasi serangan) dan siswa mendapat **poin** (makin cepat makin besar).
- Jawaban **salah / tidak menjawab** → karakter **terkena serangan musuh** (HP berkurang, bisa pingsan/KO).
- Benar **3× berturut-turut** → **ULTIMATE!** (adegan sinematik, damage 2,5×).
- Party melawan **4 musuh** bertahap: Serigala Kristal Bayangan → Golem Kristal Purba → Jenderal Iblis Vargoth →
  **Raja Iblis Azaroth** yang bangkit ke **Fase 2 (Wujud Sejati)** setelah dikalahkan.

## Karakter

| Karakter | Serangan | Ultimate | Keistimewaan |
|---|---|---|---|
| Ksatria Pedang | Tebasan Cahaya | Pedang Api Suci | — |
| Penyihir Bintang | Bola Api | Hujan Meteor | — |
| Biarawati Suci | Cahaya Suci | Sayap Malaikat | Ultimate menyembuhkan & membangkitkan seluruh party |
| Pemanah Elf | Panah Angin | Badai Tornado Zamrud | — |
| Assassin Bayangan | Lempar Belati | Tebasan Bayangan X | — |
| Paladin Perisai | Hantaman Perisai | Benteng Rune Suci | Ultimate memasang perisai: serangan balik musuh ½ |
| Pemanggil Naga Api | Semburan Api | Raungan Naga Api | — |

## Menjalankan di kelas (satu laptop guru + HP siswa di Wi-Fi yang sama)

1. Pasang [Node.js](https://nodejs.org) versi 18 atau lebih baru.
2. Di folder proyek:
   ```bash
   npm install
   npm start
   ```
3. Buka `http://localhost:3000/host` di laptop guru, sambungkan ke proyektor, tekan **⛶** untuk layar penuh.
4. Siapkan soal → klik **Buat Ruang Petualangan** → QR & kode ruang muncul.
5. Siswa memindai QR dengan kamera HP (atau buka alamat yang tertera dan ketik kode ruang).
   HP siswa dan laptop guru **harus terhubung ke jaringan Wi-Fi yang sama**. Alamat LAN laptop
   ditampilkan di terminal dan otomatis dipakai di QR.
6. Setelah semua bergabung, klik **Mulai Petualangan**.

> Jika jaringan sekolah memblokir koneksi antar-perangkat, gunakan hotspot HP/laptop guru, atau
> pasang di layanan hosting Node.js (Render, Railway, Fly.io, VPS, dll). Untuk hosting publik, atur
> variabel `PUBLIC_URL` (mis. `PUBLIC_URL=https://game-sekolahku.onrender.com`) agar QR memakai alamat itu.

### Variabel lingkungan

| Nama | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server |
| `PUBLIC_URL` | – | Alamat publik untuk QR (opsional) |
| `DEMO_HINTS` | – | `1` = kirim kunci jawaban ke klien, **hanya** untuk uji coba dengan bot |

## Menyiapkan soal

Di layar guru (`/host`) tersedia editor bank soal:

- **Tambah soal** dan ketik langsung (klik bulatan di samping pilihan untuk menandai kunci jawaban).
- **Tempel teks** dari Word/Google Docs dengan format:
  ```
  1. Ibu kota Indonesia adalah …
  A. Bandung
  B. Nusantara*
  C. Surabaya
  D. Medan
  ```
  Tandai jawaban benar dengan `*`, atau tambahkan baris `Jawaban: B`. Pisahkan soal dengan baris kosong.
- **Impor/Ekspor JSON** untuk menyimpan dan berbagi bank soal antar-guru. Format:
  ```json
  [{ "q": "5 × 6 = …", "options": ["11", "30", "56", "35"], "answer": 1 }]
  ```
  (`answer`: 0 = A, 1 = B, 2 = C, 3 = D)

Soal tersimpan otomatis di browser guru. Minimal 5 soal (satu per musuh); disarankan 15–30 soal.
Soal dibagi otomatis ke tiap musuh (lihat panel *Pembagian soal per musuh*). Untuk 20 soal: 3–4–4–4–5.

### Aturan pertarungan

- HP musuh disesuaikan dengan jumlah siswa dan jatah soal: kelas yang menjawab benar ±75% akan
  mengalahkan setiap musuh tepat pada soal terakhir jatahnya. Musuh tidak bisa tumbang sebelum
  jatahnya habis, sehingga **semua soal tetap dikerjakan**.
- Jika musuh belum kalah saat jatahnya habis, pertarungan berlanjut memakai soal musuh berikutnya.
  Bila soal habis sebelum Raja Iblis (Fase 2) kalah, party **mundur** (kalah) — tetap ada papan peringkat.
- Poin jawaban benar: 500 + bonus kecepatan (maks. 500) + bonus beruntun (50/streak, maks. 250) + 200 saat ultimate.
- Karakter yang pingsan (HP 0) bangkit lagi bila pemiliknya menjawab benar. Setiap musuh kalah, party pulih penuh.

Di akhir permainan guru dapat **mengunduh hasil (CSV)** berisi skor, jumlah benar, akurasi, dan streak terbaik
setiap siswa — bisa dibuka di Excel/Google Sheets untuk penilaian.

## Fitur kenyamanan

- HP siswa yang ter-refresh / terputus otomatis tersambung kembali tanpa kehilangan skor.
- Layar guru yang ter-refresh melanjutkan ruang yang sama.
- QR kecil + kode ruang selalu tampil di pojok untuk siswa yang terlambat.
- **Auto** = lanjut ke soal berikutnya otomatis setelah 6 detik.
- **Akhiri waktu** = tutup soal lebih cepat. Soal juga tertutup otomatis bila semua siswa sudah menjawab.
- Klik nama siswa di lobby untuk mengeluarkannya.

## Uji coba tanpa banyak HP

```bash
DEMO_HINTS=1 npm start
# di terminal lain, setelah membuat ruang (mis. kode ABCDE):
node tools/bots.js ABCDE 15 0.8      # 15 bot, akurasi ~80%
```

## Struktur proyek

```
server.js                 Server Express + Socket.IO (ruang, QR, real-time)
src/game.js               Logika permainan (skor, HP musuh, fase, serangan balik)
public/host.html          Layar guru (editor soal, lobby QR, pertarungan, hasil)
public/play.html          Kontroler HP siswa (nama, pilih karakter, tombol A–D)
public/js/battle.js       Mesin animasi pertarungan (canvas 1920×1080)
public/js/enemies.js      Musuh prosedural beranimasi (termasuk Raja Iblis fase 1 & 2)
public/js/backgrounds.js  Latar tiap stage (gambar lukisan bila ada, selain itu prosedural)
public/assets/backgrounds Latar gambar hasil tools/prepare_backgrounds.py
public/assets/characters  Atlas sprite karakter (hasil potong sprite sheet)
assets-src/sheets         Sprite sheet asli karakter
tools/slice_sprites.py    Pemotong sprite sheet → atlas WebP transparan + JSON
tools/prepare_backgrounds.py  Pemotong lembar latar (latar belakang + latar depan transparan)
tools/bots.js             Simulasi siswa untuk uji coba
test/                     Uji logika permainan (`npm test`)
```

## Mengganti / menambah sprite karakter

Sprite sheet asli (latar putih) ada di `assets-src/sheets/<id>.jpg`. Setelah mengganti gambar, sesuaikan
koordinat baris di `CONFIG` pada `tools/slice_sprites.py`, lalu jalankan:

```bash
pip install pillow numpy scipy
python3 tools/slice_sprites.py --debug   # lembar kontrol tersimpan di tools/_debug/
```

Data karakter (nama, skill, kecepatan animasi) ada di `public/js/shared/characters.js`.

## Mengganti / menambah latar stage

Lembar latar (panel atas = latar belakang, panel bawah = latar depan dengan pola papan catur)
disimpan di `assets-src/backgrounds/`. Daftarkan di `CONFIG` pada `tools/prepare_backgrounds.py`
(koordinat kedua panel), jalankan `python3 tools/prepare_backgrounds.py --debug`, lalu tambahkan
entrinya di `IMAGE_STAGES` pada `public/js/backgrounds.js` (kunci `"stage:fase"`, mis. `'2:1'`,
`'4:2'` untuk Raja Iblis fase 2). Latar depan digambar di depan karakter dan bergeser lebih cepat
saat party berjalan (efek parallax). Stage yang belum punya gambar tetap memakai latar prosedural.

Saat ini: Stage 1 (Lembah Berkabut) dan Stage 2 (Gua Kristal) memakai gambar; Stage 3–4 masih prosedural.
Lembar latar boleh juga berupa dua file terpisah (`bg_file`, `fg_file`) seperti Stage 2.

## Mengganti / menambah sprite musuh

Lembar pose musuh (idle, serangan, skill, mati) berlatar papan catur disimpan di `assets-src/enemies/`.
Daftarkan kotak tiap pose di `CONFIG` pada `tools/prepare_enemies.py`, lalu jalankan
`python3 tools/prepare_enemies.py --debug`. Hasilnya `public/assets/enemies/<id>.webp/.json`.
Saat ini Stage 1 memakai Serigala Kristal Bayangan (`wolf`) dan Stage 2 Golem Kristal Purba (`golem`);
musuh lain masih digambar dengan kode. Bila lembar tidak punya pose idle, pose idle bisa dibuat dari
pose lain (lihat konfigurasi `golem`).
