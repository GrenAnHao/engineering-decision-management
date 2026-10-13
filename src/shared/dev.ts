/**
 * 开发模式（bun run dev）的固定端口：浏览器访问 Vite，Vite 把 /api（含 SSE）代理给仅 API 的 Bun 服务。
 * 与 config.json 的 port 无关——后者只用于 bun run start 与单体可执行文件。
 *
 * 刻意避开 Vite 默认的 5173：同一台机器上常有别的 Vite 项目在跑，它们占 5173、被占用时再依次往后找（5174…），
 * 用默认端口会在 localhost（IPv6）与 127.0.0.1（IPv4）上悄悄串到另一个项目的页面。
 */
export const DEV_WEB_PORT = 5273;
export const DEV_API_PORT = 5274;
