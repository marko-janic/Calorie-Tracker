// Global setup for Jest tests
// Sets the timezone to Europe/Zurich for DST-aware tests
module.exports = async () => {
  process.env.TZ = 'Europe/Zurich';
};
