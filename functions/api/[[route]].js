// Every /api/* request is handled by the Hono app in server/app.js.
import { handle } from 'hono/cloudflare-pages';
import app from '../../server/app.js';

export const onRequest = handle(app);
