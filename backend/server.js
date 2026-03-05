const app = require('./app');
const connectDB = require('./config/db');

(async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });

    process.on('unhandledRejection', (err) => {
      console.log(`Error: ${err.message}`);
      server.close(() => process.exit(1));
    });
  } catch (err) {
    process.exit(1);
  }
})();
