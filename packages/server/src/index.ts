import { startApp } from './app';

const port = Number(process.env.PORT ?? 8080);
const staticDir = process.env.STATIC_DIR;

startApp({ port, staticDir }).then(({ port: actual }) => {
  console.log(
    `multi-tetris server listening on :${actual}${staticDir ? ` (static: ${staticDir})` : ''}`,
  );
});
