import { openDb } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const { app } = createApp(openDb(), {
  allowSignup: process.env.ALLOW_SIGNUP !== 'false',
  secureCookies: process.env.SECURE_COOKIES === 'true',
});

app.listen(port, () => {
  console.log(`Reviews system running on http://localhost:${port}`);
});
