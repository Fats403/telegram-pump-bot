module.exports = {
  exchangeApiKey: process.env.EXCHANGE_API_KEY, // your exchange API Key
  exchangeSecretKey: process.env.EXCHANGE_SECRET_KEY, // the secret key associated with your exchange API Key
  telegramPhoneNumber: process.env.TELEGRAM_PHONE_NUMBER, // your telegram phone number in E.164 format
  telegramApiId: process.env.TELEGRAM_API_ID, // the API id from telegram
  telegramApiHash: process.env.TELEGRAM_API_HASH, // the API hash from telegram
  chatTriggerIds: [521922047], // the chat group ID's that will trigger a trade, if empty it will watch every chat group
  simulate: true, // if true, sends mock requests to exchange
  exchange: "binance", // the exchange to use; aslong as it is a valid ccxt support exchnage ID (https://github.com/ccxt/ccxt)
  searchQuote: "BTC", // the trade pair quote's to search for
  quoteAssetAmount: 0.0004, // the amount of quote we want to purchase when a trade pair is found
  trailingStopPercent: 0.1, // trailing stop by percentage e.g. price * (1 - trailingStopPercent)
  trailingStopUpdateIntveral: 1000, // how often we want to check for a new price to update the trailing stop loss
  profitTargets: [
    { profitPercent: 0.05, sellAssetPercent: 0.5 }, // at 5% profit, sell 50%
    { profitPercent: 0.1, sellAssetPercent: 0.5 }, // at 10% profit, sell 50%
  ],
};
