module.exports = {
  exchangeApiKey: process.env.EXCHANGE_API_KEY, // your exchange API Key
  exchangeSecretKey: process.env.EXCHANGE_SECRET_KEY, // the secret key associated with your exchange API Key
  telegramPhoneNumber: process.env.TELEGRAM_PHONE_NUMBER, // your telegram phone number in E.164 format
  telegramApiId: process.env.TELEGRAM_API_ID, // the API id from telegram
  telegramApiHash: process.env.TELEGRAM_API_HASH, // the API hash from telegram
  channelTriggerIds: [], // the channel group ID's that will trigger a trade, if empty it will watch every channel group
  simulate: false, // if true, sends mock requests to exchange
  exchange: "binance", // the exchange to use; aslong as it is a valid ccxt support exchnage ID (https://github.com/ccxt/ccxt)
  searchQuote: "BTC", // the trade pair quote's to search for
  quoteAssetAmount: 0.005, // the amount of quote to spend once a base has been found
  trailingStopPercent: 0.08, // trailing stop by percentage e.g. price * (1 - trailingStopPercent)
  trailingStopUpdateIntveral: 500, // (ms) how often we want to check for a new price to update the trailing stop loss
  slippageTolerance: 0.02, // the percent of slippage tolerance to account for depending on market volatility
  profitTargets: [
    { profitPercent: 0.15, sellBaseAssetPercent: 0.25 },
    { profitPercent: 0.3, sellBaseAssetPercent: 0.25 }, // at 25% profit, sell 25%
    { profitPercent: 0.45, sellBaseAssetPercent: 0.25 }, // at 50% profit, sell 25%
    { profitPercent: 0.6, sellBaseAssetPercent: 0.25 }, // at 75% profit, sell 25%
  ],
};
