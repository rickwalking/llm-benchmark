import { createApp } from './app.js';

const { app } = createApp();

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});