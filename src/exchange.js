const ccxt = require("ccxt");

let self = {};
module.exports = self;

self.getExchangeClient = ({ exchange, apiKey, secret }) => {
  let exchangeClient;

  try {
    exchangeClient = new ccxt[exchange]({
      apiKey,
      secret,
      enableRateLimit: true,
    });
  } catch (e) {
    throw new Error(e.message);
  }

  return exchangeClient;
};
