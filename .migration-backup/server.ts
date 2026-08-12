import { app } from './artifacts/api-server/src/app.js';

const PORT = 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started and listening on http://0.0.0.0:${PORT}`);
});
