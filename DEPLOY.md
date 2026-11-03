# Deploy Rạp Online

Hai phần, hai nơi:

| Phần | Gồm | Deploy lên | Vì sao |
|---|---|---|---|
| **FE + API** | Web 3D (Vite), `/api/stub` (ảnh vé), `/s/:token` (link mời + OG) | **Vercel** | Có sẵn `vercel.json`, edge functions |
| **BE realtime** | `server/main.ts`: WebSocket relay (thấy nhau, chat, biểu cảm, đố vui) | **Render** (hoặc Railway / Fly.io / VPS) | Vercel không giữ được kết nối WebSocket |

Làm **BE trước** (để có URL), rồi FE.

---

## 1. BE: relay trên Render (free)

1. Vào https://render.com → đăng nhập bằng GitHub.
2. **New → Blueprint** → chọn repo `nguyenan1511/cinema-online`. Render đọc `render.yaml` và tạo service `rap-online-relay`.
3. Khi được hỏi `ALLOWED_ORIGINS`: tạm để trống (bước 3 sẽ điền).
4. Đợi build xong. URL dạng `https://rap-online-relay.onrender.com`.
5. Kiểm tra: mở `https://rap-online-relay.onrender.com/health` → thấy `{"ok":true,"players":0}`.

> Gói free của Render **ngủ sau 15 phút không ai dùng**; người đầu tiên vào sẽ chờ ~30–60s để relay thức dậy (web vẫn chạy, chỉ phần chat/thấy nhau kết nối chậm). Muốn luôn thức: gói Starter (~7$/tháng).

Chạy thử relay trên máy: `npm run build:server && PORT=8787 npm run start:server`.

## 2. FE: Vercel

1. Vào https://vercel.com → **Add New → Project** → import `nguyenan1511/cinema-online`.
2. Framework: để Vercel tự nhận (Vite). Build command / output đã có trong `vercel.json` (`npm run build` → `dist`).
3. **Environment Variables** (Production):
   - `VITE_RT_URL` = `wss://rap-online-relay.onrender.com/rt` (lưu ý `wss://` và đuôi `/rt`)
4. **Deploy**. URL dạng `https://cinema-online.vercel.app`.

> `VITE_*` được nhúng lúc build: đổi giá trị thì phải **Redeploy**.

## 3. Khoá relay chỉ cho web của bạn

Render → service `rap-online-relay` → **Environment** → `ALLOWED_ORIGINS` = `https://cinema-online.vercel.app` (nhiều domain thì cách nhau dấu phẩy, thêm cả domain riêng nếu có) → Save (tự deploy lại).

## 4. Kiểm tra sau deploy

- Mở web trên 2 thiết bị → góc trên phải hiện **"2 người trong rạp"**, chat thấy nhau.
- Mở `https://<web>/s/<token>` của một vé đã chia sẻ → có ảnh xem trước (OG).
- Poster phim Việt hiện, trailer chạy trên màn 3D.

## 5. Cập nhật phim hằng tuần

```
npm run refresh-films        # cần TMDB_API_KEY trong .env
git add data/films.json data/films.index.json && git commit -m "chore: refresh films" && git push
```
Vercel và Render tự deploy lại khi có commit mới trên `master`.

## Lưu ý

- `.env` (TMDB key) chỉ dùng trên máy để refresh phim; **không** cần đưa lên Vercel/Render.
- Pikachu chỉ có ở bản local (không nằm trong git, bị loại khỏi build production).
- Relay giữ trạng thái trong bộ nhớ của **một** process: đừng scale lên nhiều instance (người ở instance khác sẽ không thấy nhau).
- Domain riêng: thêm ở Vercel → Settings → Domains, rồi nhớ thêm domain đó vào `ALLOWED_ORIGINS`.
